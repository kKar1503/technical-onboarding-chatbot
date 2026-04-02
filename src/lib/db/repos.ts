import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_REPOSITORIES } from "~/lib/aws/dynamodb";
import type { Repository, RepoStatus } from "~/types";

export async function createRepo(repo: Repository): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_REPOSITORIES,
      Item: {
        PK: `REPO#${repo.id}`,
        SK: "METADATA",
        ...repo,
      },
    }),
  );
}

export async function getRepo(repoId: string): Promise<Repository | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_REPOSITORIES,
      Key: { PK: `REPO#${repoId}`, SK: "METADATA" },
    }),
  );
  if (!result.Item) return null;
  return itemToRepo(result.Item);
}

export async function listRepos(): Promise<Repository[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_REPOSITORIES,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "METADATA" },
    }),
  );
  return (result.Items ?? []).map(itemToRepo);
}

export async function updateRepoStatus(
  repoId: string,
  status: RepoStatus,
  lastAnalyzedAt?: string,
): Promise<void> {
  const updateExpr = lastAnalyzedAt
    ? "SET #status = :status, lastAnalyzedAt = :lat"
    : "SET #status = :status";
  const exprValues: Record<string, unknown> = { ":status": status };
  if (lastAnalyzedAt) exprValues[":lat"] = lastAnalyzedAt;

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_REPOSITORIES,
      Key: { PK: `REPO#${repoId}`, SK: "METADATA" },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: exprValues,
    }),
  );
}

export async function updateRepoKnowledgeBase(
  repoId: string,
  knowledgeBaseId: string,
  dataSourceId: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_REPOSITORIES,
      Key: { PK: `REPO#${repoId}`, SK: "METADATA" },
      UpdateExpression:
        "SET knowledgeBaseId = :kbId, dataSourceId = :dsId",
      ExpressionAttributeValues: {
        ":kbId": knowledgeBaseId,
        ":dsId": dataSourceId,
      },
    }),
  );
}

export async function deleteRepo(repoId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_REPOSITORIES,
      Key: { PK: `REPO#${repoId}`, SK: "METADATA" },
    }),
  );
}

function itemToRepo(item: Record<string, unknown>): Repository {
  return {
    id: item.id as string,
    name: item.name as string,
    gitUrl: item.gitUrl as string,
    branch: item.branch as string,
    status: item.status as Repository["status"],
    lastAnalyzedAt: (item.lastAnalyzedAt as string) ?? null,
    knowledgeBaseId: (item.knowledgeBaseId as string) ?? null,
    dataSourceId: (item.dataSourceId as string) ?? null,
    s3Prefix: item.s3Prefix as string,
  };
}
