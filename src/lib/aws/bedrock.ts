import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

export const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export const chatModel = bedrock("anthropic.claude-sonnet-4-20250514");
