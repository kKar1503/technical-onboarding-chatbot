import {
  PutCommand,
  GetCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_USERS } from "~/lib/aws/dynamodb";
import type { User } from "~/types";

export async function createUser(user: User): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_USERS,
      Item: {
        PK: `USER#${user.id}`,
        SK: "PROFILE",
        ...user,
      },
    }),
  );
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_USERS,
      Key: { PK: `USER#${userId}`, SK: "PROFILE" },
    }),
  );
  if (!result.Item) return null;
  return itemToUser(result.Item);
}

export async function listUsers(): Promise<User[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_USERS,
      FilterExpression: "SK = :sk",
      ExpressionAttributeValues: { ":sk": "PROFILE" },
    }),
  );
  return (result.Items ?? []).map(itemToUser);
}

function itemToUser(item: Record<string, unknown>): User {
  return {
    id: item.id as string,
    name: item.name as string,
    role: item.role as User["role"],
    defaultMode: item.defaultMode as User["defaultMode"],
    createdAt: item.createdAt as string,
  };
}
