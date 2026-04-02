"use client";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  GitBranch,
  Play,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { Repository } from "~/types";

interface RepoCardProps {
  repo: Repository;
  onAnalyze: (id: string) => void;
  onDelete: (id: string) => void;
}

const statusConfig = {
  pending: {
    label: "Pending",
    variant: "secondary" as const,
    icon: Clock,
  },
  analyzing: {
    label: "Analyzing",
    variant: "default" as const,
    icon: Loader2,
  },
  ready: {
    label: "Ready",
    variant: "default" as const,
    icon: CheckCircle,
  },
  error: {
    label: "Error",
    variant: "destructive" as const,
    icon: AlertCircle,
  },
};

export function RepoCard({ repo, onAnalyze, onDelete }: RepoCardProps) {
  const config = statusConfig[repo.status];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{repo.name}</CardTitle>
        <Badge variant={config.variant} className="gap-1">
          <StatusIcon
            className={`h-3 w-3 ${repo.status === "analyzing" ? "animate-spin" : ""}`}
          />
          {config.label}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span className="truncate">{repo.gitUrl}</span>
            <span className="text-muted-foreground/60">({repo.branch})</span>
          </div>

          {repo.lastAnalyzedAt && (
            <p className="text-xs text-muted-foreground">
              Last analyzed:{" "}
              {new Date(repo.lastAnalyzedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => onAnalyze(repo.id)}
              disabled={repo.status === "analyzing"}
            >
              {repo.status === "analyzing" ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {repo.status === "pending" ? "Analyze" : "Re-analyze"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => onDelete(repo.id)}
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
