import {
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_CONVERSATIONS } from "~/lib/aws/dynamodb";
import type { Conversation, ConversationMessage } from "~/types";

export async function createConversation(
  conv: Conversation,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_CONVERSATIONS,
      Item: {
        ...conv,
        PK: `CONV#${conv.id}`,
        SK: "METADATA",
      },
    }),
  );
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_CONVERSATIONS,
      Key: { PK: `CONV#${conversationId}`, SK: "METADATA" },
    }),
  );
  if (!result.Item) return null;
  return itemToConversation(result.Item);
}

export async function listConversationsByUser(
  userId: string,
): Promise<Conversation[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_CONVERSATIONS,
      IndexName: "GSI1",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? [])
    .filter((item) => (item.SK as string) === "METADATA")
    .map(itemToConversation);
}

export async function addMessage(
  msg: ConversationMessage,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_CONVERSATIONS,
      Item: {
        PK: `CONV#${msg.conversationId}`,
        SK: `MSG#${msg.createdAt}#${msg.id}`,
        ...msg,
      },
    }),
  );
}

export async function getMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_CONVERSATIONS,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `CONV#${conversationId}`,
        ":prefix": "MSG#",
      },
      ScanIndexForward: true,
    }),
  );
  return (result.Items ?? []).map(itemToMessage);
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  // First get all items for this conversation
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_CONVERSATIONS,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `CONV#${conversationId}` },
      ProjectionExpression: "PK, SK",
    }),
  );

  // Delete each item
  const deletePromises = (result.Items ?? []).map((item) =>
    docClient.send(
      new DeleteCommand({
        TableName: TABLE_CONVERSATIONS,
        Key: { PK: item.PK as string, SK: item.SK as string },
      }),
    ),
  );
  await Promise.all(deletePromises);
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_CONVERSATIONS,
      Key: { PK: `CONV#${conversationId}`, SK: "METADATA" },
      UpdateExpression: "SET title = :title",
      ExpressionAttributeValues: { ":title": title },
    }),
  );
}

function itemToConversation(item: Record<string, unknown>): Conversation {
  return {
    id: item.id as string,
    userId: item.userId as string,
    repoId: item.repoId as string,
    title: item.title as string,
    mode: item.mode as Conversation["mode"],
    createdAt: item.createdAt as string,
  };
}

function itemToMessage(item: Record<string, unknown>): ConversationMessage {
  return {
    id: item.id as string,
    conversationId: item.conversationId as string,
    role: item.role as ConversationMessage["role"],
    content: item.content as string,
    createdAt: item.createdAt as string,
  };
}
