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
    DYNAMODB_TABLE_CONVERSATIONS: z.string().optional(),
    DYNAMODB_TABLE_REPOSITORIES: z.string().optional(),
    DYNAMODB_TABLE_USERS: z.string().optional(),
    BEDROCK_CHAT_MODEL: z
      .string()
      .default("us.anthropic.claude-haiku-4-5-20251001-v1:0"),
    BEDROCK_ANALYSIS_MODEL: z
      .string()
      .default("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
    EMBEDDING_MODEL_ID: z
      .string()
      .default("amazon.titan-embed-text-v2:0"),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
    VECTOR_BUCKET_NAME: z.string().min(1),
    VECTOR_BUCKET_ARN: z.string().min(1),
    BEDROCK_KB_ROLE_ARN: z.string().min(1),
    KNOWLEDGE_BUCKET_ARN: z.string().min(1),
    S3_KMS_KEY_ARN: z.string().min(1),
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
    DYNAMODB_TABLE_CONVERSATIONS: process.env.DYNAMODB_TABLE_CONVERSATIONS,
    DYNAMODB_TABLE_REPOSITORIES: process.env.DYNAMODB_TABLE_REPOSITORIES,
    DYNAMODB_TABLE_USERS: process.env.DYNAMODB_TABLE_USERS,
    BEDROCK_CHAT_MODEL: process.env.BEDROCK_CHAT_MODEL,
    BEDROCK_ANALYSIS_MODEL: process.env.BEDROCK_ANALYSIS_MODEL,
    EMBEDDING_MODEL_ID: process.env.EMBEDDING_MODEL_ID,
    EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS,
    VECTOR_BUCKET_NAME: process.env.VECTOR_BUCKET_NAME,
    VECTOR_BUCKET_ARN: process.env.VECTOR_BUCKET_ARN,
    BEDROCK_KB_ROLE_ARN: process.env.BEDROCK_KB_ROLE_ARN,
    KNOWLEDGE_BUCKET_ARN: process.env.KNOWLEDGE_BUCKET_ARN,
    S3_KMS_KEY_ARN: process.env.S3_KMS_KEY_ARN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
