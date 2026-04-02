"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { GitBranch } from "lucide-react";
import type { Repository } from "~/types";

interface RepoSelectorProps {
  repos: Repository[];
  selectedRepoId: string | null;
  onSelect: (repoId: string) => void;
}

export function RepoSelector({
  repos,
  selectedRepoId,
  onSelect,
}: RepoSelectorProps) {
  const readyRepos = repos.filter((r) => r.status === "ready");

  if (readyRepos.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitBranch className="h-3 w-3" />
        No analyzed repositories
      </div>
    );
  }

  return (
    <Select value={selectedRepoId ?? undefined} onValueChange={(val) => { if (val) onSelect(val); }}>
      <SelectTrigger className="h-8 w-[200px] text-xs">
        <GitBranch className="mr-1 h-3 w-3" />
        <SelectValue placeholder="Select repository" />
      </SelectTrigger>
      <SelectContent>
        {readyRepos.map((repo) => (
          <SelectItem key={repo.id} value={repo.id} className="text-xs">
            {repo.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
