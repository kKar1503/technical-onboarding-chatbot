import { ToolLoopAgent } from "ai";
import { chatModel } from "~/lib/aws/bedrock";
import { createRetrieveKnowledgeTool } from "~/lib/tools/bedrock-kb-retrieve";
import {
  SYSTEM_CHAT_TECHNICAL,
  SYSTEM_CHAT_NON_TECHNICAL,
} from "~/lib/prompts";
import type { ChatMode } from "~/types";

export function createChatAgent(
  knowledgeBaseId: string,
  mode: ChatMode,
) {
  return new ToolLoopAgent({
    model: chatModel,
    instructions:
      mode === "technical"
        ? SYSTEM_CHAT_TECHNICAL
        : SYSTEM_CHAT_NON_TECHNICAL,
    tools: {
      retrieveKnowledge: createRetrieveKnowledgeTool(knowledgeBaseId),
    },
    // Cache the system prompt across turns. Bedrock pays a 25% premium on
    // the first request and 10% of normal input on cache reads (5-min TTL),
    // so this is a net win for any multi-turn conversation.
    providerOptions: {
      bedrock: { cachePoint: { type: "default" } },
    },
  });
}
