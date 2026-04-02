import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    KNOWLEDGE_S3_BUCKET: z.string().min(1),
    GITLAB_WEBHOOK_SECRET: z.string().min(1),
    GITLAB_ACCESS_TOKEN: z.string().min(1),
    SQS_ANALYSIS_QUEUE_URL: z.string().url(),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    KNOWLEDGE_S3_BUCKET: process.env.KNOWLEDGE_S3_BUCKET,
    GITLAB_WEBHOOK_SECRET: process.env.GITLAB_WEBHOOK_SECRET,
    GITLAB_ACCESS_TOKEN: process.env.GITLAB_ACCESS_TOKEN,
    SQS_ANALYSIS_QUEUE_URL: process.env.SQS_ANALYSIS_QUEUE_URL,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
