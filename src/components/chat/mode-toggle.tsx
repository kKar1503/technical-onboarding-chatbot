"use client";

import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Code, BookOpen } from "lucide-react";
import type { ChatMode } from "~/types";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(v) => onModeChange(v as ChatMode)}
    >
      <TabsList className="h-8">
        <TabsTrigger value="technical" className="gap-1.5 text-xs">
          <Code className="h-3 w-3" />
          Technical
        </TabsTrigger>
        <TabsTrigger value="non-technical" className="gap-1.5 text-xs">
          <BookOpen className="h-3 w-3" />
          Non-Technical
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
