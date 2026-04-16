// Minimal GitLab REST client.

interface MergeRequestChange {
  new_path: string;
  old_path: string;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
}

interface MergeRequestChangesResponse {
  changes?: MergeRequestChange[];
}

export type ChangeType = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  changeType: ChangeType;
  /** For renames only: the pre-rename path. */
  oldPath?: string;
}

const GITLAB_BASE =
  process.env.GITLAB_API_URL ?? "https://gitlab.com/api/v4";

/**
 * Fetches the file-level diff summary for a merged MR.
 *
 * Renames are expanded into two entries: a `deleted` for the old path and a
 * `modified` for the new path. This keeps downstream logic (source-file
 * uploads, prompt rendering) uniform — no special case for renames.
 */
export async function fetchMergeRequestChangedFiles(
  projectId: number,
  mrIid: number,
): Promise<ChangedFile[]> {
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
  const out: ChangedFile[] = [];

  for (const c of body.changes ?? []) {
    if (c.deleted_file) {
      out.push({ path: c.old_path, changeType: "deleted" });
      continue;
    }
    if (c.renamed_file) {
      // Treat as delete-of-old + modify-of-new so the source mirror stays clean.
      out.push({ path: c.old_path, changeType: "deleted" });
      out.push({
        path: c.new_path,
        changeType: "modified",
        oldPath: c.old_path,
      });
      continue;
    }
    out.push({
      path: c.new_path,
      changeType: c.new_file ? "added" : "modified",
    });
  }

  return out;
}
