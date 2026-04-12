# Onboarding Chatbot

AI-assisted onboarding assistant that answers questions about internal GitLab repositories using Amazon Bedrock Knowledge Bases. GitLab webhooks trigger an async worker that ingests repo contents into an S3-backed knowledge base; the Next.js app serves a streaming chat UI that retrieves from the KB at query time.

## Architecture

```
 GitLab  ──webhook──▶  Next.js API  ──SQS──▶  Worker (Fargate)
                             │                      │
                             ▼                      ▼
                        DynamoDB              S3  ──▶  Bedrock KB
                             │                            ▲
                             ▼                            │
                     Chat UI (useChat) ─── stream ─── Bedrock (Claude)
```

- **Web** — Next.js 15 (App Router, standalone output) on ECS EC2 behind an ALB.
- **Worker** — `tsx` process on Fargate, consumes the `analysis` FIFO SQS queue and triggers Bedrock KB ingestion jobs.
- **Data** — DynamoDB tables for users, conversations, and repositories. S3 bucket holds knowledge-base source documents.
- **AI** — AI SDK v6 with `@ai-sdk/amazon-bedrock`; `ToolLoopAgent` calls a Bedrock KB retrieve tool.
- **Infra** — Terraform in [`infra/`](./infra) (VPC + fck-nat, ALB, ECS cluster, DynamoDB, S3, SQS + DLQ, SSM params, CloudWatch alarms + dashboard).

See [`docs/aws-infrastructure.drawio.png`](./docs/aws-infrastructure.drawio.png) for the full diagram.

## Project layout

```
src/
  app/                  Next.js routes (chat UI, /api/*, admin)
  components/           React components (chat, admin, ui)
  lib/
    agents/             ToolLoopAgent setups (chat, analysis)
    aws/                DynamoDB / S3 / SQS / Bedrock clients
    db/                 Data access for users, conversations, repos
    tools/              AI SDK tools (Bedrock KB retrieve)
  worker/               Analysis-queue consumer (pnpm worker)
  scripts/              One-off scripts (seed-users)
  env.js                Typed env validation (@t3-oss/env-nextjs)
infra/                  Terraform for AWS deployment
deployments/            CI samples (GitHub Actions, GitLab CI)
docs/                   Deploy + CI/CD guides, architecture diagram
```

## Local development

Requirements: Node 20+, pnpm 10, Docker (optional), AWS credentials with access to the target account's Bedrock, DynamoDB, S3, and SQS resources.

```bash
pnpm install
cp .env.example .env        # fill in AWS + GitLab values
pnpm seed                   # optional: seed users table
pnpm dev                    # Next.js on :3000
pnpm worker                 # in a second terminal: analysis worker
```

To skip env validation during Docker builds or ad-hoc scripts: `SKIP_ENV_VALIDATION=1`.

### Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm worker` | Run the SQS analysis worker locally |
| `pnpm build` / `pnpm start` | Production build + standalone server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | ESLint (T3 flat config) |
| `pnpm check` | Lint + typecheck |
| `pnpm format:write` / `pnpm format:check` | Prettier |
| `pnpm seed` | Seed DynamoDB users table |

## Deployment

Full walkthrough: [`docs/aws-deployment.md`](./docs/aws-deployment.md). CI/CD options (GitHub Actions / GitLab CI): [`docs/ci-cd-deployment.md`](./docs/ci-cd-deployment.md), with ready-to-copy pipelines in [`deployments/`](./deployments).

TL;DR:

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in secrets + alarm_email
terraform init
terraform apply
```

Then push images to the ECR repos created by Terraform and trigger ECS service redeploys (see the deployment doc).

## Observability

- ALB liveness probe at `/api/healthcheckz` — shallow 200 (process health only). Kept cheap so a DynamoDB/SQS blip doesn't drain healthy tasks.
- Deep readiness probe at `/api/readyz` — verifies DynamoDB + SQS reachability, returns 503 on dependency failure. Not wired to the ALB; call on-demand from a canary, CI smoke test, or humans.
- CloudWatch dashboard `<project>-<env>-overview` (requests/5xx/latency, queue depth + DLQ + age, ECS CPU/memory, Bedrock throttles).
- SNS alarms on ALB 5xx, unhealthy hosts, DLQ depth, queue backlog, oldest message age, Bedrock throttles, and Next.js CPU. Set `alarm_email` in `terraform.tfvars` to subscribe.

## Environment variables

All server-side vars are validated in [`src/env.js`](./src/env.js). Keep [`.env.example`](./.env.example) in sync when adding new keys.
