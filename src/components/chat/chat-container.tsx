"use client";

import { useCallback, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { api } from "~/lib/api";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { ModeToggle } from "./mode-toggle";
import { RepoSelector } from "./repo-selector";
import { ConversationSidebar } from "./conversation-sidebar";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { Menu } from "lucide-react";
import type { ChatMode, Conversation, Repository } from "~/types";

export function ChatContainer() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("technical");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        conversationId: activeConversationId,
        repoId: selectedRepoId,
        mode,
      },
      headers: (): Record<string, string> => {
        const userId =
          typeof window !== "undefined"
            ? localStorage.getItem("onboarding-user-id")
            : null;
        return userId ? { "X-User-Id": userId } : ({} as Record<string, string>);
      },
    }),
  });

  // Load repos and conversations on mount
  useEffect(() => {
    void api.get<Repository[]>("/repos").then((res) => setRepos(res.data));
    void api
      .get<Conversation[]>("/conversations")
      .then((res) => setConversations(res.data));
  }, []);

  // Auto-select first ready repo
  useEffect(() => {
    if (!selectedRepoId) {
      const firstReady = repos.find((r) => r.status === "ready");
      if (firstReady) setSelectedRepoId(firstReady.id);
    }
  }, [repos, selectedRepoId]);

  const handleNewConversation = useCallback(async () => {
    if (!selectedRepoId) return;
    const res = await api.post<Conversation>("/conversations", {
      repoId: selectedRepoId,
      mode,
    });
    setConversations((prev) => [res.data, ...prev]);
    setActiveConversationId(res.data.id);
    setMessages([]);
  }, [selectedRepoId, mode, setMessages]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        setSelectedRepoId(conv.repoId);
        setMode(conv.mode);
      }
      // Load messages for this conversation
      const res = await api.get(`/conversations/${id}`);
      const data = res.data as {
        messages: Array<{ id: string; role: string; content: string }>;
      };
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: m.content }],
        })),
      );
      setSidebarOpen(false);
    },
    [conversations, setMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await api.delete(`/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
    [activeConversationId, setMessages],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!selectedRepoId) return;

      // Auto-create conversation if none active
      if (!activeConversationId) {
        const res = await api.post<Conversation>("/conversations", {
          repoId: selectedRepoId,
          mode,
          title: text.slice(0, 50),
        });
        setConversations((prev) => [res.data, ...prev]);
        setActiveConversationId(res.data.id);
      }

      sendMessage({ text });
    },
    [selectedRepoId, activeConversationId, mode, sendMessage],
  );

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeConversationId}
      onSelect={(id) => void handleSelectConversation(id)}
      onNew={() => void handleNewConversation()}
      onDelete={(id) => void handleDeleteConversation(id)}
    />
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <div className="hidden md:block">{sidebar}</div>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger
          className="md:hidden"
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-14 z-10"
            >
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <SheetContent side="left" className="w-64 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <RepoSelector
            repos={repos}
            selectedRepoId={selectedRepoId}
            onSelect={setSelectedRepoId}
          />
          <ModeToggle mode={mode} onModeChange={setMode} />
        </div>

        {/* Messages */}
        <MessageList messages={messages} status={status} />

        {/* Input */}
        <ChatInput onSend={handleSend} onStop={stop} status={status} />
      </div>
    </div>
  );
}
