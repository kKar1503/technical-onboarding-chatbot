import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  createRepo,
  listRepos,
  updateRepoKnowledgeBase,
  updateRepoStatus,
} from "~/lib/db/repos";
import { createKnowledgeBaseForRepo } from "~/lib/aws/bedrock-kb";

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

  const id = nanoid();
  const s3Prefix = `knowledge/${id}`;

  const repo = {
    id,
    name: body.name,
    gitUrl: body.gitUrl,
    branch: body.branch,
    status: "pending" as const,
    lastAnalyzedAt: null,
    knowledgeBaseId: null,
    dataSourceId: null,
    vectorIndexArn: null,
    s3Prefix,
  };

  await createRepo(repo);

  try {
    const { knowledgeBaseId, dataSourceId, vectorIndexArn } =
      await createKnowledgeBaseForRepo(id, body.name, s3Prefix);
    await updateRepoKnowledgeBase(
      id,
      knowledgeBaseId,
      dataSourceId,
      vectorIndexArn,
    );
    return NextResponse.json(
      { ...repo, knowledgeBaseId, dataSourceId, vectorIndexArn },
      { status: 201 },
    );
  } catch (err) {
    console.error("[repos] KB provisioning failed", err);
    await updateRepoStatus(id, "error");
    return NextResponse.json(
      { ...repo, status: "error", error: (err as Error).message },
      { status: 500 },
    );
  }
}
