import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createRepo, listRepos } from "~/lib/db/repos";

export async function GET() {
  const repos = await listRepos();
  return NextResponse.json(repos);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name: string;
    gitUrl: string;
    branch: string;
  };

  const repo = {
    id: nanoid(),
    name: body.name,
    gitUrl: body.gitUrl,
    branch: body.branch,
    status: "pending" as const,
    lastAnalyzedAt: null,
    knowledgeBaseId: null,
    dataSourceId: null,
    s3Prefix: `knowledge/${nanoid()}`,
  };

  await createRepo(repo);
  return NextResponse.json(repo, { status: 201 });
}
