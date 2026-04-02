# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache git
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- Next.js Production ----
FROM base AS nextjs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ---- Worker ----
FROM base AS worker
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Worker needs git for cloning repos
RUN apk add --no-cache git openssh-client

CMD ["npx", "tsx", "src/worker/index.ts"]
