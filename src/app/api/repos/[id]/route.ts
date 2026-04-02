import { NextResponse } from "next/server";
import { getRepo, deleteRepo } from "~/lib/db/repos";

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
  await deleteRepo(id);
  return NextResponse.json({ success: true });
}
