import { NextResponse } from "next/server";
import { getRepo, deleteRepo } from "~/lib/db/repos";
import { deleteKnowledgeBaseForRepo } from "~/lib/aws/bedrock-kb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repo = await getRepo(id);

  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  return NextResponse.json(repo);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repo = await getRepo(id);
  if (!repo) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  await deleteKnowledgeBaseForRepo(
    repo.knowledgeBaseId,
    repo.dataSourceId,
    repo.vectorIndexArn,
  );
  await deleteRepo(id);
  return NextResponse.json({ success: true });
}
