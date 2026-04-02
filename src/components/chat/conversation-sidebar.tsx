"use client";

import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import type { Conversation } from "~/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-medium">Conversations</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNew}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                activeId === conv.id && "bg-muted",
              )}
              onClick={() => onSelect(conv.id)}
            >
              <span className="truncate">{conv.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
