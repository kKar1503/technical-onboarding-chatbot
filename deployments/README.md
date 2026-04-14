# Deployment Pipelines

Sample CI/CD pipeline configurations for deploying the onboarding chatbot to AWS.

These files are **not active**. To use them:

- **GitHub Actions**: Copy `github-actions.yml` to `.github/workflows/deploy.yml`
- **GitLab CI**: Copy `gitlab-ci.yml` to `.gitlab-ci.yml` at the project root

Both pipelines follow the same flow:

1. `terraform apply` — infrastructure only (no image-tag vars). The ECS services use `lifecycle { ignore_changes = [task_definition, desired_count] }` so this never reverts the running image.
2. Build Docker images (`linux/amd64`) for the `nextjs` and `worker` Dockerfile targets
3. Push to ECR with a unique tag derived from the git SHA (`nextjs-<sha>` / `worker-<sha>`)
4. For each service: `describe-task-definition` → patch image → `register-task-definition` → `update-service --task-definition <new-arn>`
5. `aws ecs wait services-stable` to confirm the rollout

See [`../docs/ci-cd-deployment.md`](../docs/ci-cd-deployment.md) for the deployment strategy overview and [`../docs/aws-deployment.md`](../docs/aws-deployment.md) for the initial infrastructure setup.

## Required Secrets

Both pipelines need these secrets configured in your CI provider:

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key for an IAM user with the [Terraform runner policy](../infra/terraform-runner-iam.json) |
| `AWS_SECRET_ACCESS_KEY` | Matching AWS secret access key |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `TF_VAR_gitlab_webhook_secret` | GitLab webhook secret |
| `TF_VAR_gitlab_access_token` | GitLab personal access token |

For GitHub Actions, using OIDC to assume an IAM role is more secure than long-lived access keys — see the commented alternative in `github-actions.yml`.
