export type ChatMode = "technical" | "non-technical";
export type UserRole = "engineer" | "ba";
export type RepoStatus = "pending" | "analyzing" | "ready" | "error";
export type AnalysisJobType = "full" | "incremental";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  defaultMode: ChatMode;
  createdAt: string;
}

export interface Repository {
  id: string;
  name: string;
  gitUrl: string;
  branch: string;
  status: RepoStatus;
  lastAnalyzedAt: string | null;
  knowledgeBaseId: string | null;
  dataSourceId: string | null;
  vectorIndexArn: string | null;
  s3Prefix: string;
}

export interface Conversation {
  id: string;
  userId: string;
  repoId: string;
  title: string;
  mode: ChatMode;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AnalysisJob {
  repoId: string;
  type: AnalysisJobType;
  mrIid?: string;
  changedFiles?: string[];
}

export interface KnowledgeChunk {
  content: string;
  source: string;
  score: number;
}
