# CI/CD Deployment Guide

## Ownership model

Two systems share responsibility:

- **Terraform** owns infrastructure: VPC, ALB, ECS cluster + services, IAM, DynamoDB, S3, SQS, KMS, CloudWatch alarms, S3 Vectors bucket. It also defines an *initial* task-definition revision pointing at `:latest`.
- **CI** owns image rollouts: builds Docker images, pushes to ECR, registers a new task-def revision with the new image tag, and calls `ecs update-service`.

The ECS services use `lifecycle { ignore_changes = [task_definition, desired_count] }` so re-running `terraform apply` never reverts the image or fights autoscaling. Infra changes and app deploys are independent.

```
              ┌─ Terraform apply  ──→  Infra + initial task-def(:latest)
git push ─┤
              └─ CI deploy        ──→  Build → Push → Register TD → update-service
```

## Image tagging

Each image gets `nextjs-<sha>` / `worker-<sha>` (git short SHA). The ECR repo has `image_tag_mutability = IMMUTABLE`, so the same tag can't be overwritten — every commit produces a unique, auditable artifact.

## Pipeline samples

Working pipelines live in [`deployments/`](../deployments):

- [`github-actions.yml`](../deployments/github-actions.yml)
- [`gitlab-ci.yml`](../deployments/gitlab-ci.yml)

Both pipelines run the same logical steps:

1. Checkout + AWS auth
2. `terraform apply` (infrastructure only — no image-tag vars)
3. Read service / task-def family names from `terraform output`
4. `docker buildx build --push` for both `nextjs` and `worker` Dockerfile targets
5. For each service: `describe-task-definition` → patch image → `register-task-definition` → capture new ARN
6. `update-service --task-definition <new-ARN>` on both services
7. `aws ecs wait services-stable` on the Next.js service

The script that does the register step (used in both pipelines):

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
```

It clones the latest revision (preserving env vars, IAM roles, secrets, log config — all of which Terraform owns), swaps just the container image, and registers it. The new revision inherits any infra changes from the most recent `terraform apply`.

## Required secrets / env

### GitHub Actions

Repository secrets:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — for the deploy IAM principal *(or use OIDC — see comment in the workflow)*
- `TF_VAR_gitlab_webhook_secret`
- `TF_VAR_gitlab_access_token`

### GitLab CI

CI/CD variables (mark as **Masked** + **Protected**):

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `TF_VAR_gitlab_webhook_secret`
- `TF_VAR_gitlab_access_token`

The runner image must have `aws-cli`, `jq`, and Docker available. The provided `gitlab-ci.yml` installs them on `alpine:3.19` per stage.

## Deploying manually

If CI is broken or you need a one-off deploy, the same flow runs locally — see [Step 5 in `aws-deployment.md`](./aws-deployment.md#step-5-build-and-roll-out-the-first-images).

## Rollback

### Roll back to a previous task-def revision (fastest)

```bash
CLUSTER=$(terraform -chdir=infra output -raw ecs_cluster_name)
SERVICE=$(terraform -chdir=infra output -raw nextjs_service_name)
FAMILY=$(terraform -chdir=infra output -raw nextjs_task_family)

# List recent revisions
aws ecs list-task-definitions --family-prefix "$FAMILY" --sort DESC --max-items 5

# Roll back to a specific revision (e.g., :42)
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$FAMILY:42"

aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
```

This is instant — no rebuild needed because old revisions still reference their old image tags in ECR.

### Roll back to a previous image (re-deploy the old SHA)

Re-run the CI pipeline against the previous commit, or manually:

```bash
PREV_SHA=abc1234
# Same register_new_revision function as the pipeline
NEW_TD=$(register_new_revision "$FAMILY" "$ECR_URL:nextjs-$PREV_SHA")
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$NEW_TD"
```

### Roll back infrastructure

Revert the offending Terraform commit, run `terraform apply`. The next CI deploy will pick up the reverted task-def shape.

## Health checks during rollout

ECS waits for the new tasks to pass the ALB target-group health check at `GET /api/healthcheckz` (shallow 200) before draining old tasks. If health checks fail, ECS stops the deployment and the old tasks keep serving.

For deeper verification post-deploy, hit `GET /api/readyz` — it probes DynamoDB and SQS reachability and returns 503 on dependency failure. Wire this into a CloudWatch Synthetics canary or a CI smoke step if you want automated post-deploy verification.

## Observability

CloudWatch alarms that page during/after a deploy:

- `onboarding-<env>-nextjs-5xx` — target group 5xx > 5/min
- `onboarding-<env>-nextjs-unhealthy-hosts` — any failing health checks
- `onboarding-<env>-nextjs-cpu-high` — sustained CPU > 80%
- `onboarding-<env>-analysis-dlq-not-empty` — failed analysis jobs
- `onboarding-<env>-bedrock-throttles` — model-level quota pressure

All publish to the SNS topic `onboarding-<env>-alerts` — subscribe via the `alarm_email` tfvar.

Dashboard: `onboarding-<env>-overview` (request/5xx/latency, queue depth + DLQ + age, ECS CPU/memory, Bedrock).
