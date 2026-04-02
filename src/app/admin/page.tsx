"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "~/lib/api";
import { RepoCard } from "~/components/admin/repo-card";
import { RepoForm } from "~/components/admin/repo-form";
import type { Repository } from "~/types";

export default function AdminPage() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Repository[]>("/repos")
      .then((res) => setRepos(res.data))
      .finally(() => setLoading(false));
  }, []);

  const handleAddRepo = useCallback(
    async (data: { name: string; gitUrl: string; branch: string }) => {
      const res = await api.post<Repository>("/repos", data);
      setRepos((prev) => [...prev, res.data]);
    },
    [],
  );

  const handleAnalyze = useCallback(async (id: string) => {
    await api.post(`/repos/${id}/analyze`);
    setRepos((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "analyzing" as const } : r)),
    );
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await api.delete(`/repos/${id}`);
    setRepos((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Repositories</h1>
          <p className="text-sm text-muted-foreground">
            Manage repositories and trigger knowledge analysis
          </p>
        </div>
        <RepoForm onSubmit={(data) => void handleAddRepo(data)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
        </div>
      ) : repos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No repositories added yet. Click &quot;Add Repository&quot; to get
            started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onAnalyze={(id) => void handleAnalyze(id)}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
