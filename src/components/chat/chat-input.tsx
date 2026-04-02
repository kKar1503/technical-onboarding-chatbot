"use client";

import { useState, type KeyboardEvent } from "react";
import { Textarea } from "~/components/ui/textarea";
import { Button } from "~/components/ui/button";
import { SendHorizontal, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  status: string;
}

export function ChatInput({ onSend, onStop, status }: ChatInputProps) {
  const [input, setInput] = useState("");

  const isReady = status === "ready";

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !isReady) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t p-4">
      <div className="mx-auto flex max-w-3xl gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the repository..."
          disabled={!isReady}
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
        />
        {status === "streaming" || status === "submitted" ? (
          <Button
            variant="destructive"
            size="icon"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || !isReady}
            className="shrink-0"
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
