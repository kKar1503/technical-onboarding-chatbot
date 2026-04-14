# AWS Deployment Guide

End-to-end instructions to deploy the onboarding chatbot to AWS from scratch.

## Prerequisites

Install locally:

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Docker](https://docs.docker.com/get-docker/) with buildx
- `pnpm` 10 (used for app development)
- `jq` (CI rollouts use it)

You'll also need:

- An AWS account with admin access for the one-time bootstrap
- A GitLab access token with `api` + `read_repository` scopes
- A GitLab webhook secret (any random string — generate with `openssl rand -hex 32`)

## Step 1: Create the Terraform IAM principal

Don't run Terraform with root or admin. Create a dedicated user.

1. **IAM → Users → Create user** → name `onboarding-terraform`
2. Attach a custom policy with the contents of [`infra/terraform-runner-iam.json`](../infra/terraform-runner-iam.json)
3. Create an access key (type: "Application running outside AWS")
4. Save the credentials

## Step 2: Configure AWS CLI

```bash
aws configure --profile onboarding
# AWS Access Key ID: <from step 1>
# AWS Secret Access Key: <from step 1>
# Default region: ap-southeast-1
# Default output format: json

export AWS_PROFILE=onboarding
aws sts get-caller-identity   # sanity check
```

## Step 3: Enable Bedrock model access

Bedrock requires explicit opt-in per model per region. Cannot be automated by Terraform.

In the AWS Console: **Amazon Bedrock → Model access** (in your deploy region) → **Modify model access** → request:

- **Anthropic Claude Haiku 4.5** — used by the chat agent (fast, cheap)
- **Anthropic Claude Sonnet 4.5** — used by the analysis agent (slow, accurate)
- **Amazon Titan Text Embeddings V2** — used by the Knowledge Base for embeddings

Approval for Anthropic + Amazon models is usually instant.

> **Region note:** if you're outside `us-*`, the Claude 4.5 IDs use a region prefix (`us.`, `apac.`, `eu.`). The defaults in `terraform.tfvars.example` use `us.` — change to `apac.anthropic.claude-...` for `ap-southeast-1` if needed, or override via `bedrock_chat_model` / `bedrock_analysis_model` tfvars.

## Step 4: Provision infrastructure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
environment           = "dev"
gitlab_webhook_secret = "<your-random-secret>"
gitlab_access_token   = "glpat-..."
alarm_email           = "ops@example.com"  # optional but recommended
```

Apply:

```bash
terraform init
terraform plan
terraform apply
```

Takes ~10 minutes. Provisions:

- VPC, public + private subnets, fck-nat instance (Graviton, ~$3/mo NAT alternative), security groups
- ALB + target group + HTTP listener (HTTPS gated on `certificate_arn`)
- ECR repo (immutable tags, KMS-encrypted)
- 3 DynamoDB tables (PAY_PER_REQUEST, KMS-encrypted)
- 2 S3 buckets — `knowledge` (KB source docs) + `access-logs`
- 1 S3 Vectors bucket (shared backing store for all per-repo KBs)
- SQS FIFO queue + DLQ
- ECS cluster, EC2 ASG for Next.js, Fargate worker (scale-to-zero)
- IAM roles (Next.js task, worker task, Bedrock KB service role, ECS execution)
- 5 KMS customer-managed keys
- 9 CloudWatch alarms + 1 dashboard + SNS alerts topic
- SSM Parameter Store entries for the GitLab secrets

> The ECS services will fail their first deploy because ECR is empty. Step 5 fixes that.

Save the outputs:

```bash
terraform output
```

You'll need:

- `alb_dns_name` — public URL
- `ecr_repository_url` — Docker push target
- `ecs_cluster_name`, `nextjs_service_name`, `worker_service_name`, `nextjs_task_family`, `worker_task_family` — used by the rollout commands below
- `vector_bucket_name`, `vector_bucket_arn`, `bedrock_kb_role_arn` — used by the Next.js task at runtime

## Step 5: Build and roll out the first images

> **CI normally owns this** ([`deployments/`](../deployments) has GitHub Actions and GitLab CI samples). Use the manual flow below only for the first deploy or local testing.

From the project root:

```bash
cd ..

ECR_URL=$(cd infra && terraform output -raw ecr_repository_url)
CLUSTER=$(cd infra && terraform output -raw ecs_cluster_name)
NEXTJS_SERVICE=$(cd infra && terraform output -raw nextjs_service_name)
WORKER_SERVICE=$(cd infra && terraform output -raw worker_service_name)
NEXTJS_FAMILY=$(cd infra && terraform output -raw nextjs_task_family)
WORKER_FAMILY=$(cd infra && terraform output -raw worker_task_family)

aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS --password-stdin "$ECR_URL"

IMAGE_TAG=$(git rev-parse --short HEAD)

# Build for linux/amd64 even on Apple Silicon
docker buildx build --platform linux/amd64 --target nextjs \
  -t "$ECR_URL:nextjs-$IMAGE_TAG" --push .
docker buildx build --platform linux/amd64 --target worker \
  -t "$ECR_URL:worker-$IMAGE_TAG" --push .
```

Register a new task-def revision and roll the service:

```bash
register_new_revision() {
  local family="$1" image="$2"
  aws ecs describe-task-definition --task-definition "$family" --query 'taskDefinition' \
    | jq --arg IMG "$image" '
        .containerDefinitions[0].image = $IMG
        | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions,
           volumes, placementConstraints, requiresCompatibilities, cpu, memory, tags,
           runtimePlatform}
        | with_entries(select(.value != null and .value != []))' \
    | aws ecs register-task-definition --cli-input-json file:///dev/stdin \
        --query 'taskDefinition.taskDefinitionArn' --output text
}

NEXTJS_TD=$(register_new_revision "$NEXTJS_FAMILY" "$ECR_URL:nextjs-$IMAGE_TAG")
WORKER_TD=$(register_new_revision "$WORKER_FAMILY" "$ECR_URL:worker-$IMAGE_TAG")

aws ecs update-service --cluster "$CLUSTER" --service "$NEXTJS_SERVICE" --task-definition "$NEXTJS_TD"
aws ecs update-service --cluster "$CLUSTER" --service "$WORKER_SERVICE" --task-definition "$WORKER_TD"

aws ecs wait services-stable --cluster "$CLUSTER" --services "$NEXTJS_SERVICE"
```

Why this dance instead of `terraform apply -var=image_tag=...`? The ECS services have `lifecycle { ignore_changes = [task_definition, desired_count] }`. Terraform owns the infrastructure shape; CI owns image rollouts and autoscaling. Re-running `terraform apply` will not revert the image.

## Step 6: Seed the users table

```bash
export AWS_REGION=ap-southeast-1
export DYNAMODB_TABLE_USERS=$(cd infra && terraform output -raw users_table_name)
pnpm seed
```

## Step 7: Smoke-test

```bash
ALB=$(cd infra && terraform output -raw alb_dns_name)

# Liveness probe (ALB hits this every 30s)
curl "http://$ALB/api/healthcheckz"
# {"status":"ok"}

# Deep readiness probe (DynamoDB + SQS reachability)
curl "http://$ALB/api/readyz"
# {"status":"ok","checks":{"dynamodb":"ok","sqs":"ok"}}
```

Visit `http://<alb>` — you should see the user picker.

## Step 8: Add a repository

The app provisions Bedrock KBs **automatically** when you register a repo. Each repo gets:

1. A vector index inside the shared S3 Vectors bucket
2. A Bedrock Knowledge Base referencing that index
3. A data source pointing at `s3://<knowledge-bucket>/knowledge/<repo-id>/`

Use the admin UI (`/admin`) or `POST /api/repos`:

```bash
curl -X POST "http://$ALB/api/repos" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","gitUrl":"https://gitlab.com/team/my-app.git","branch":"main"}'
```

The response includes `knowledgeBaseId`, `dataSourceId`, and `vectorIndexArn` — they're stored in DynamoDB. If KB provisioning fails the repo is created with `status=error` and the error message is returned.

## Step 9: Configure the GitLab webhook

Per repository:

1. **GitLab → Settings → Webhooks**
2. URL: `http://<alb>/api/webhooks/gitlab`
3. Secret token: same `gitlab_webhook_secret` from `terraform.tfvars`
4. Trigger: ✅ **Merge request events**

A successful merge enqueues an analysis job, which the Fargate worker picks up (it scales from 0 → 1 in ~60s when a message lands), regenerates the knowledge documents, and triggers KB ingestion.

## Future deployments

For day-to-day deploys, **use the CI pipelines** in [`deployments/`](../deployments). They do the same register-task-def + update-service flow as Step 5 automatically on push to `main`.

For manual one-off deploys, re-run only the build + register + update commands from Step 5 — no `terraform apply` needed unless infra changed.

For infrastructure changes (CPU/memory, env vars, alarms, IAM):

```bash
cd infra && terraform plan && terraform apply
```

The next CI deploy will pick up new env vars / IAM changes via the new task-def revision it registers.

## Observability

- **Dashboard:** CloudWatch → Dashboards → `onboarding-<env>-overview` (request rate, 5xx, latency p95, queue depth, ECS CPU/memory, Bedrock invocations + throttles)
- **Alarms** publish to the SNS topic `onboarding-<env>-alerts`. Subscribe via `alarm_email` tfvar or manually attach Slack/PagerDuty
- **Logs:**
  ```bash
  aws logs tail /ecs/onboarding-dev/nextjs --follow
  aws logs tail /ecs/onboarding-dev/worker --follow
  ```

## Cost estimate

Rough monthly cost in `ap-southeast-1` for a low-volume internal deployment:

| Item | ~USD/mo |
| --- | --- |
| ALB | 17 |
| EC2 t3.small (Next.js, always-on) | 17 |
| EC2 t4g.nano (fck-nat) | 3 |
| EBS roots | 5 |
| Fargate worker (scale-to-zero, ~10hr/mo) | 1 |
| DynamoDB (pay-per-request) | 1 |
| S3 (knowledge + access logs) | 1 |
| **S3 Vectors** (storage + queries) | <5 |
| SQS, ECR, SNS | <2 |
| CloudWatch (logs + 9 alarms + dashboard) | 8–10 |
| 5 KMS keys | 5 |
| Data transfer egress | 5–20 |
| **AWS infra subtotal** | **~$65–90** |
| Bedrock Haiku 4.5 (chat) | depends on volume; ~$45 at 5k messages/mo |
| Bedrock Sonnet 4.5 (analysis) | depends on merge frequency; ~$100 at 100 merges/mo |

S3 Vectors replaces OpenSearch Serverless (which would add ~$350/mo floor) — the dominant cost win for this stack.

Set a billing alarm in CloudWatch and an anomaly-detection alert on Bedrock spend.

## Troubleshooting

### ECS task fails to start

```bash
aws logs tail /ecs/onboarding-dev/nextjs --follow
```

Common causes:

- **Image platform mismatch** — built on arm64 Mac without `--platform linux/amd64`
- **Bedrock model access not granted** — opt in via the console (Step 3); the IAM perms are present but the model itself is gated per account
- **Region mismatch on Claude 4.5 model ID** — switch the prefix (`us.` → `apac.`) or change `bedrock_chat_model` / `bedrock_analysis_model` tfvars
- **Missing env var** — `src/env.js` validates on boot; the failed validation shows up in the first log lines

### ALB returns 502/503

The Next.js task hasn't passed health checks:

```bash
TG_ARN=$(aws elbv2 describe-target-groups \
  --names "$(terraform -chdir=infra output -raw nextjs_service_name | sed 's/-nextjs/-nextjs-tg/')" \
  --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 describe-target-health --target-group-arn "$TG_ARN"
```

### Worker never picks up jobs

- Confirm `onboarding-<env>-worker-scale-up` alarm is firing (CloudWatch → Alarms)
- Check `desiredCount` scales above 0:
  ```bash
  aws ecs describe-services --cluster "$CLUSTER" --services "$WORKER_SERVICE" \
    --query 'services[0].{desired:desiredCount,running:runningCount}'
  ```
- DLQ filling? `aws sqs get-queue-attributes --queue-url <dlq-url> --attribute-names ApproximateNumberOfMessagesVisible`

### KB provisioning fails on `POST /api/repos`

Most likely:

- Bedrock model access for Titan embeddings not granted in the deploy region
- S3 Vectors not available in the region (check supported regions; `ap-southeast-1` is supported as of 2026)
- Next.js task role missing `iam:PassRole` to the Bedrock KB role — re-run `terraform apply`

## Tearing down

```bash
cd infra
terraform destroy
```

Manual cleanup needed for:

- **S3 buckets** — Terraform won't delete non-empty buckets. Empty `knowledge` and `access-logs` first.
- **S3 Vectors indexes** — created at runtime per repo. If you skipped `DELETE /api/repos/:id` for each repo, run:
  ```bash
  aws s3vectors list-indexes --vector-bucket-name <name> --query 'indexes[].indexName' --output text \
    | xargs -n1 -I{} aws s3vectors delete-index --vector-bucket-name <name> --index-name {}
  ```
- **Bedrock Knowledge Bases** — same: app-created, listed via `aws bedrock list-knowledge-bases`.
- **KMS keys** — scheduled for deletion by Terraform with a 7–30 day waiting period. Cancel via `aws kms cancel-key-deletion` if needed.
- **ECR images** — `aws ecr batch-delete-image` per repo.
