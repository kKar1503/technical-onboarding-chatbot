import { NextResponse } from "next/server";
import { getRepo, updateRepoStatus } from "~/lib/db/repos";
import { sendAnalysisJob } from "~/lib/aws/sqs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repo = await getRepo(id);

  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  if (repo.status === "analyzing") {
    return NextResponse.json(
      { error: "Analysis already in progress" },
      { status: 409 },
    );
  }

  await updateRepoStatus(id, "analyzing");

  await sendAnalysisJob({
    repoId: id,
    type: "full",
  });

  return NextResponse.json({ message: "Analysis started" }, { status: 202 });
}
