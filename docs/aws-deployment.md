# AWS Deployment Guide

End-to-end instructions to deploy the onboarding chatbot to AWS from scratch.

## Prerequisites

Install the following tools locally:

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Docker](https://docs.docker.com/get-docker/) (with buildx for multi-platform builds)
- `pnpm` (already used for app development)

You'll also need:
- An AWS account with admin access (for one-time setup)
- A GitLab access token with `api` + `read_repository` scopes
- A GitLab webhook secret (any random string you generate)

## Step 1: Create an IAM User for Terraform

Rather than running Terraform with your root account or admin user, create a dedicated IAM user with only the permissions needed.

1. In the AWS Console, go to **IAM → Users → Create user**
2. Name it `onboarding-terraform`
3. Attach a custom policy using the contents of [`infra/terraform-runner-iam.json`](../infra/terraform-runner-iam.json)
4. Create an access key for this user (type: "Application running outside AWS")
5. Save the Access Key ID and Secret Access Key — you'll need them next

## Step 2: Configure AWS CLI

```bash
aws configure --profile onboarding
# AWS Access Key ID: <paste from step 1>
# AWS Secret Access Key: <paste from step 1>
# Default region: ap-southeast-1
# Default output format: json
```

Export the profile so all subsequent commands use it:

```bash
export AWS_PROFILE=onboarding
```

Verify:

```bash
aws sts get-caller-identity
# Should return your IAM user's ARN
```

## Step 3: Enable Amazon Bedrock Model Access

Bedrock requires explicit opt-in for each model. This cannot be automated via Terraform.

1. In the AWS Console, go to **Amazon Bedrock → Model access** (in your chosen region, e.g. `ap-southeast-1`)
2. Click **Modify model access**
3. Request access to:
   - **Anthropic Claude Sonnet 4** (`anthropic.claude-sonnet-4-20250514`)
   - **Amazon Titan Text Embeddings V2** (needed for Knowledge Base embeddings)
4. Submit — approval is usually instant

## Step 4: Provision Infrastructure with Terraform

```bash
cd infra
```

Create your `terraform.tfvars` from the example:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and set:

```hcl
environment           = "dev"
gitlab_webhook_secret = "<your-random-secret>"
gitlab_access_token   = "glpat-xxxxxxxxxxxxxxxxxxxx"
```

Initialize and apply:

```bash
terraform init
terraform plan
terraform apply
```

This will take ~10 minutes. It creates:
- VPC, subnets, fck-nat instance, security groups
- ALB
- ECR repository
- 3 DynamoDB tables (with KMS encryption + PITR)
- S3 buckets (knowledge + access logs, both KMS-encrypted)
- SQS FIFO queue + DLQ (encrypted)
- CloudWatch log groups (KMS-encrypted)
- SSM SecureString parameters for secrets
- All IAM roles and policies
- ECS cluster with EC2 capacity provider
- EC2 ASG for Next.js
- Fargate service for worker (scale-to-zero)

**Note:** The ECS services will fail to start initially because the ECR repository is empty. We'll fix that in the next step.

Save the outputs — you'll reference them later:

```bash
terraform output
```

Key outputs:
- `alb_dns_name` — the URL where the app will be reachable
- `ecr_repository_url` — where to push Docker images
- `ecs_cluster_name` — for CLI operations

## Step 5: Build and Push Docker Images

From the project root:

```bash
cd ..   # back to project root

# Authenticate Docker with ECR
ECR_URL=$(cd infra && terraform output -raw ecr_repository_url)
AWS_REGION=ap-southeast-1
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ECR_URL

# Build and push the Next.js image
IMAGE_TAG=$(git rev-parse --short HEAD)

docker build --target nextjs -t $ECR_URL:nextjs-$IMAGE_TAG .
docker push $ECR_URL:nextjs-$IMAGE_TAG

# Build and push the worker image
docker build --target worker -t $ECR_URL:worker-$IMAGE_TAG .
docker push $ECR_URL:worker-$IMAGE_TAG
```

**Note on architecture:** If you're building on an Apple Silicon Mac (arm64) but deploying to x86 EC2 instances (t3.small), use buildx to build for the correct platform:

```bash
docker buildx build --platform linux/amd64 --target nextjs -t $ECR_URL:nextjs-$IMAGE_TAG --push .
docker buildx build --platform linux/amd64 --target worker -t $ECR_URL:worker-$IMAGE_TAG --push .
```

## Step 6: Update Terraform with New Image Tags

Apply again, this time with the actual image tags:

```bash
cd infra

terraform apply \
  -var="nextjs_image_tag=nextjs-$IMAGE_TAG" \
  -var="worker_image_tag=worker-$IMAGE_TAG"
```

ECS will register new task definition revisions and roll out the services.

Wait a few minutes for the EC2 instance to register with the cluster and the task to pass health checks:

```bash
aws ecs describe-services \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --services $(terraform output -raw nextjs_service_name) \
  --query 'services[0].{desired:desiredCount,running:runningCount,status:status}'
```

## Step 7: Create a Bedrock Knowledge Base (per repository)

The app creates one Bedrock Knowledge Base per registered repository. For the first repository, you'll need to create one manually (the app will reference it by ID). Future iterations can automate this via the admin UI.

For each repository you want to analyze:

1. In the AWS Console, go to **Bedrock → Knowledge Bases → Create knowledge base**
2. Name: `onboarding-<repo-id>`
3. Data source: S3
   - Bucket: use the `s3_bucket_name` from Terraform outputs
   - Prefix: `knowledge/<repo-id>/`
4. Embeddings model: `Amazon Titan Text Embeddings V2`
5. Vector store: **S3 Vectors** (cheapest)
6. Note the `knowledgeBaseId` and `dataSourceId` — store these in the DynamoDB repositories table

## Step 8: Seed the Users Table

The app uses a simple user picker with pre-seeded users. Run the seed script:

```bash
cd ..   # project root

# Set env vars to point at real AWS
export AWS_REGION=ap-southeast-1
export DYNAMODB_TABLE_USERS=$(cd infra && terraform output -raw users_table_name)

pnpm seed
```

## Step 9: Test the Deployment

Get the ALB URL:

```bash
cd infra && terraform output -raw alb_dns_name
```

Visit it in a browser: `http://<alb-dns-name>`

You should see the user picker. Select a user and start chatting once you've added a repository via the admin page and its analysis completes.

Verify the health check:

```bash
curl http://<alb-dns-name>/api/healthcheckz
# {"status":"ok"}
```

## Step 10: Configure GitLab Webhook

For each repository you want to sync:

1. In GitLab, go to **Settings → Webhooks**
2. URL: `http://<alb-dns-name>/api/webhooks/gitlab`
3. Secret token: the same `gitlab_webhook_secret` you set in terraform.tfvars
4. Trigger: ✅ **Merge request events**
5. Save

## Future Deployments

Once everything is set up, deploying a new version is:

```bash
# Build + push
IMAGE_TAG=$(git rev-parse --short HEAD)
docker buildx build --platform linux/amd64 --target nextjs -t $ECR_URL:nextjs-$IMAGE_TAG --push .
docker buildx build --platform linux/amd64 --target worker -t $ECR_URL:worker-$IMAGE_TAG --push .

# Deploy
cd infra
terraform apply \
  -var="nextjs_image_tag=nextjs-$IMAGE_TAG" \
  -var="worker_image_tag=worker-$IMAGE_TAG"
```

See [`ci-cd-deployment.md`](./ci-cd-deployment.md) for the recommended CI/CD pipeline setup and rollback procedures.

## Troubleshooting

### ECS task fails to start

Check the CloudWatch logs:

```bash
aws logs tail /ecs/onboarding-dev/nextjs --follow
aws logs tail /ecs/onboarding-dev/worker --follow
```

Common issues:
- **Image platform mismatch**: you built on arm64 Mac but deploy to x86 EC2. Use `docker buildx --platform linux/amd64`.
- **Missing Bedrock model access**: the task role has permission but you didn't opt in via the console. Revisit Step 3.
- **Secrets not found**: SSM parameter ARNs in task definition don't match. Re-run `terraform apply`.

### ALB returns 502/503

The Next.js task hasn't passed health checks. Check:

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups --names onboarding-dev-nextjs-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
```

### Worker never picks up jobs

- Verify the SQS alarm is firing when messages arrive: **CloudWatch → Alarms**
- Check that desired count scales above 0 when messages appear
- Check worker logs for errors

### Cost monitoring

Set a billing alarm in CloudWatch to avoid surprises. Main cost drivers:
- EC2 t3.small (~$15/mo) — Next.js always-on
- Fargate worker (pay-per-use, ~$0 when idle)
- fck-nat t4g.nano (~$3/mo)
- KMS keys (5 × $1 = $5/mo)
- Bedrock Claude calls (variable — monitor usage)
- S3 + DynamoDB (pay-per-request, minimal at small scale)

Expected baseline: **~$25-30/mo** plus Bedrock usage.

## Tearing Down

To destroy everything:

```bash
cd infra
terraform destroy
```

You'll also need to manually:
- Empty the S3 buckets (Terraform won't delete non-empty buckets)
- Delete any Bedrock Knowledge Bases you created manually in Step 7
- Schedule KMS keys for deletion (they have a 7-30 day waiting period)
