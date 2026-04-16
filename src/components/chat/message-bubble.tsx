"use client";

import type { UIMessage } from "ai";
import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Card } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Bot, User, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UI } from "~/lib/config";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-2",
          isUser ? "items-end" : "items-start",
        )}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div
                key={index}
                className={cn(
                  "rounded-lg px-4 py-2",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.text}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }

          // AI SDK v6: tool parts use tool-<toolName> pattern
          if (part.type === "tool-retrieveKnowledge") {
            if (part.state === "output-available") {
              const result = part.output as {
                found: boolean;
                sources?: Array<{
                  content: string;
                  source: string;
                  relevanceScore: number;
                }>;
              };
              if (result.found && result.sources) {
                return (
                  <Card key={index} className="w-full border-dashed p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span>
                        Found {result.sources.length} knowledge sources
                      </span>
                    </div>
                    <div className="space-y-1">
                      {result.sources.slice(0, UI.maxInlineSources).map((source, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="mr-1 text-xs font-normal"
                        >
                          {source.source
                            .split("/")
                            .pop()
                            ?.replace(".md", "") ?? "source"}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                );
              }
            }
            if (
              part.state === "input-available" ||
              part.state === "input-streaming"
            ) {
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  Searching knowledge base...
                </div>
              );
            }
            return null;
          }

          return null;
        })}
      </div>
    </div>
  );
}
