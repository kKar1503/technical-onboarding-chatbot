import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { createChatAgent } from "~/lib/agents/chat-agent";
import { getRepo } from "~/lib/db/repos";
import { addMessage } from "~/lib/db/conversations";
import { nanoid } from "nanoid";
import type { ChatMode } from "~/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages: UIMessage[];
    conversationId: string;
    repoId: string;
    mode: ChatMode;
  };

  const { messages, conversationId, repoId, mode } = body;

  const repo = await getRepo(repoId);
  if (!repo) {
    return new Response(JSON.stringify({ error: "Repository not found" }), {
      status: 404,
    });
  }

  if (!repo.knowledgeBaseId) {
    return new Response(
      JSON.stringify({
        error: "Repository has not been analyzed yet",
      }),
      { status: 400 },
    );
  }

  const agent = createChatAgent(repo.knowledgeBaseId, mode);

  // Save the latest user message
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "user") {
    const textPart = lastMessage.parts.find((p) => p.type === "text");
    if (textPart && textPart.type === "text") {
      await addMessage({
        id: lastMessage.id ?? nanoid(),
        conversationId,
        role: "user",
        content: textPart.text,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onFinish: async ({ responseMessage }) => {
      const textContent = responseMessage.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("");
      await addMessage({
        id: responseMessage.id ?? nanoid(),
        conversationId,
        role: "assistant",
        content: textContent,
        createdAt: new Date().toISOString(),
      });
    },
  });
}
