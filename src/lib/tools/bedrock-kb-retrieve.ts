import { tool } from "ai";
import { z } from "zod";
import { retrieveFromKnowledgeBase } from "~/lib/aws/bedrock-kb";

export function createRetrieveKnowledgeTool(knowledgeBaseId: string) {
  return tool({
    description:
      "Search the repository knowledge base for relevant information. Use this tool to answer questions about the repository's architecture, code, APIs, data models, workflows, and conventions. Always search before answering technical questions.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The search query. Be specific and descriptive to get the most relevant results.",
        ),
    }),
    execute: async ({ query }) => {
      const chunks = await retrieveFromKnowledgeBase(
        knowledgeBaseId,
        query,
        5,
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
