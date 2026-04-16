import { tool } from "ai";
import { z } from "zod";
import { retrieveFromKnowledgeBase } from "~/lib/aws/bedrock-kb";
import { RETRIEVAL } from "~/lib/config";
import {
  TOOL_RETRIEVE_KNOWLEDGE,
  TOOL_RETRIEVE_KNOWLEDGE_QUERY,
} from "~/lib/prompts";

export function createRetrieveKnowledgeTool(knowledgeBaseId: string) {
  return tool({
    description: TOOL_RETRIEVE_KNOWLEDGE,
    inputSchema: z.object({
      query: z.string().describe(TOOL_RETRIEVE_KNOWLEDGE_QUERY),
    }),
    execute: async ({ query }) => {
      const chunks = await retrieveFromKnowledgeBase(
        knowledgeBaseId,
        query,
        RETRIEVAL.chatTopK,
      );

      if (chunks.length === 0) {
        return {
          found: false,
          message: "No relevant information found in the knowledge base.",
          sources: [],
        };
      }

      return {
        found: true,
        sources: chunks.map((chunk) => ({
          content: chunk.content,
          source: chunk.source,
          relevanceScore: chunk.score,
        })),
      };
    },
  });
}
