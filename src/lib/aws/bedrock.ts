import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { env } from "~/env";

export const bedrock = createAmazonBedrock({
  region: env.AWS_REGION,
});

// Fast + cheap for user-facing chat (retrieve → answer loop).
export const chatModel = bedrock(env.BEDROCK_CHAT_MODEL);

// Slow + accurate for async repo analysis (many tool calls, long output).
export const analysisModel = bedrock(env.BEDROCK_ANALYSIS_MODEL);
