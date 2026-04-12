# CI/CD Deployment Guide

## Overview

Deployments are managed through Terraform. The CI/CD pipeline builds Docker images, pushes them to ECR with immutable tags (git SHA), and runs `terraform apply` to update the ECS task definitions and trigger rolling deployments.

## Architecture

```
Git Push → CI Pipeline → Docker Build → ECR Push → Terraform Apply → ECS Rolling Deploy
```

- **Terraform** is the single source of truth for both infrastructure and deployments
- **ECR tags are immutable** — each deploy produces a unique tag, no overwriting
- **ECS task definitions are append-only** — new revisions are created, old ones remain for rollback

## Image Tagging Strategy

Use git short SHA as the image tag:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD)

# Build both targets
docker build --target nextjs -t $ECR_URL:nextjs-$IMAGE_TAG .
docker build --target worker -t $ECR_URL:worker-$IMAGE_TAG .

# Push
docker push $ECR_URL:nextjs-$IMAGE_TAG
docker push $ECR_URL:worker-$IMAGE_TAG
```

## Deploying

### Via Terraform (recommended)

```bash
cd infra

terraform apply \
  -var="nextjs_image_tag=nextjs-abc1234" \
  -var="worker_image_tag=worker-abc1234"
```

This will:
1. Register new ECS task definition revisions with the updated image tags
2. Update the ECS services to use the new revisions
3. ECS performs a rolling deployment (drains old tasks, starts new ones)

### What Terraform Does NOT Do

- It does not delete old task definition revisions (they're append-only in ECS)
- It does not force-kill running tasks (ECS drains them gracefully)

## Rollback

### Option A: Terraform (creates a new revision pointing to the old image)

```bash
terraform apply \
  -var="nextjs_image_tag=nextjs-previous_sha" \
  -var="worker_image_tag=worker-previous_sha"
```

### Option B: AWS CLI (points service back to an old revision directly)

```bash
# List recent task definition revisions
aws ecs list-task-definitions --family-prefix onboarding-dev-nextjs --sort DESC --max-items 5

# Roll back to a specific revision
aws ecs update-service \
  --cluster onboarding-dev \
  --service onboarding-dev-nextjs \
  --task-definition onboarding-dev-nextjs:3
```

## Infrastructure Changes

CPU, memory, environment variables, IAM roles, and other infra changes go through normal Terraform PRs:

```bash
# Example: increase worker memory
# Edit infra/variables.tf or infra/ecs-worker.tf
terraform plan   # review changes
terraform apply  # apply
```

## CI Pipeline Example (GitLab CI)

```yaml
stages:
  - build
  - deploy

variables:
  ECR_URL: <account_id>.dkr.ecr.us-east-1.amazonaws.com/onboarding-dev-app
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA

build:
  stage: build
  script:
    - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
    - docker build --target nextjs -t $ECR_URL:nextjs-$IMAGE_TAG .
    - docker build --target worker -t $ECR_URL:worker-$IMAGE_TAG .
    - docker push $ECR_URL:nextjs-$IMAGE_TAG
    - docker push $ECR_URL:worker-$IMAGE_TAG

deploy:
  stage: deploy
  script:
    - cd infra
    - terraform init
    - terraform apply -auto-approve
        -var="nextjs_image_tag=nextjs-$IMAGE_TAG"
        -var="worker_image_tag=worker-$IMAGE_TAG"
  only:
    - main
```

## Health Check

The ALB checks `GET /api/healthcheckz` on the Next.js service. ECS will not route traffic to a new task until it passes the health check. If the new image fails health checks, ECS will stop the deployment and keep the old tasks running.
