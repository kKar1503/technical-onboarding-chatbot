// Minimal GitLab REST client.

interface MergeRequestChange {
  new_path: string;
  old_path: string;
  deleted_file?: boolean;
  renamed_file?: boolean;
}

interface MergeRequestChangesResponse {
  changes?: MergeRequestChange[];
}

const GITLAB_BASE =
  process.env.GITLAB_API_URL ?? "https://gitlab.com/api/v4";

export async function fetchMergeRequestChangedFiles(
  projectId: number,
  mrIid: number,
): Promise<string[]> {
  const token = process.env.GITLAB_ACCESS_TOKEN;
  if (!token) throw new Error("GITLAB_ACCESS_TOKEN not configured");

  const url = `${GITLAB_BASE}/projects/${projectId}/merge_requests/${mrIid}/changes`;
  const res = await fetch(url, {
    headers: { "PRIVATE-TOKEN": token },
  });
  if (!res.ok) {
    throw new Error(
      `GitLab MR changes failed: ${res.status} ${await res.text()}`,
    );
  }

  const body = (await res.json()) as MergeRequestChangesResponse;
  // Use new_path; for deleted files keep old_path so the agent can find
  // documents that referenced them.
  return (body.changes ?? []).map((c) =>
    c.deleted_file ? c.old_path : c.new_path,
  );
}
