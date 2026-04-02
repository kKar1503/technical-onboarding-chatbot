"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";

interface MessageListProps {
  messages: UIMessage[];
  status: string;
}

export function MessageList({ messages, status }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium text-muted-foreground">
            Start a conversation
          </h3>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Ask anything about the repository
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {(status === "submitted" || status === "streaming") && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            {status === "submitted" ? "Thinking..." : "Responding..."}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
