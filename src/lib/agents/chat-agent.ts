import { ToolLoopAgent } from "ai";
import { chatModel } from "~/lib/aws/bedrock";
import { createRetrieveKnowledgeTool } from "~/lib/tools/bedrock-kb-retrieve";
import type { ChatMode } from "~/types";

const TECHNICAL_INSTRUCTIONS = `You are an expert software engineering assistant helping developers onboard to a repository.

Your approach:
- Always search the knowledge base before answering questions about the repository
- Include specific file paths, function names, and code references when relevant
- Explain architectural decisions and patterns used in the codebase
- When discussing changes, explain potential impacts on dependent modules
- Provide code snippets and implementation details
- Reference specific modules, APIs, and data models by name
- If you don't find sufficient information in the knowledge base, say so clearly

Format responses in Markdown with code blocks where appropriate.`;

const NON_TECHNICAL_INSTRUCTIONS = `You are a friendly assistant helping team members understand a software repository in plain language.

Your approach:
- Always search the knowledge base before answering questions
- Explain things in simple, non-technical language — avoid jargon
- Focus on what features and components DO from a business perspective
- When asked about validation or business rules, explain the "what" and "why", not the "how"
- Use analogies and everyday language to explain technical concepts
- Never include code snippets or file paths unless specifically asked
- If you don't find sufficient information in the knowledge base, say so clearly

Keep responses concise and easy to understand.`;

export function createChatAgent(
  knowledgeBaseId: string,
  mode: ChatMode,
) {
  return new ToolLoopAgent({
    model: chatModel,
    instructions:
      mode === "technical"
        ? TECHNICAL_INSTRUCTIONS
        : NON_TECHNICAL_INSTRUCTIONS,
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
