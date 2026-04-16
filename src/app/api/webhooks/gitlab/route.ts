import { NextResponse } from "next/server";
import { listRepos } from "~/lib/db/repos";
import { sendAnalysisJob } from "~/lib/aws/sqs";
import { fetchMergeRequestChangedFiles } from "~/lib/gitlab";

export async function POST(request: Request) {
  // Verify GitLab webhook secret
  const token = request.headers.get("x-gitlab-token");
  const expectedSecret = process.env.GITLAB_WEBHOOK_SECRET;

  if (!token || token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    object_kind: string;
    object_attributes?: {
      action?: string;
      state?: string;
      target_branch?: string;
      iid?: number;
      source?: { web_url?: string };
    };
    project?: {
      id?: number;
      web_url?: string;
      git_http_url?: string;
      git_ssh_url?: string;
    };
    changes?: Record<string, unknown>;
  };

  // Only handle merge request events
  if (body.object_kind !== "merge_request") {
    return NextResponse.json({ message: "Ignored: not a merge request event" });
  }

  const attrs = body.object_attributes;
  if (attrs?.action !== "merge" || attrs.state !== "merged") {
    return NextResponse.json({ message: "Ignored: not a merge event" });
  }

  // Find the matching repo by git URL
  const repos = await listRepos();
  const projectUrl = body.project?.git_http_url ?? body.project?.web_url ?? "";
  const matchingRepo = repos.find(
    (r) =>
      r.gitUrl === projectUrl ||
      r.gitUrl === body.project?.git_ssh_url,
  );

  if (!matchingRepo) {
    return NextResponse.json(
      { message: "No matching repository configured" },
      { status: 404 },
    );
  }

  // Only process merges to the configured branch
  if (attrs.target_branch !== matchingRepo.branch) {
    return NextResponse.json({
      message: `Ignored: merge to ${attrs.target_branch}, not ${matchingRepo.branch}`,
    });
  }

  // Fetch changed files so the worker can run a tightly-scoped analysis
  // instead of re-scanning the whole repo. Failure is non-fatal: the worker
  // can still fall back to a broader scan.
  let changedFiles: string[] | undefined;
  if (body.project?.id != null && attrs.iid != null) {
    try {
      changedFiles = await fetchMergeRequestChangedFiles(
        body.project.id,
        attrs.iid,
      );
    } catch (err) {
      console.warn("[webhook] could not fetch MR changed files", err);
    }
  }

  await sendAnalysisJob({
    repoId: matchingRepo.id,
    type: "incremental",
    mrIid: String(attrs.iid),
    changedFiles,
  });

  return NextResponse.json(
    { message: "Incremental analysis queued", changedFiles },
    { status: 202 },
  );
}
