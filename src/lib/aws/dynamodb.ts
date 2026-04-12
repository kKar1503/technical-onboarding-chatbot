import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_CONVERSATIONS =
  process.env.DYNAMODB_TABLE_CONVERSATIONS ?? "onboarding-conversations";
export const TABLE_REPOSITORIES =
  process.env.DYNAMODB_TABLE_REPOSITORIES ?? "onboarding-repositories";
export const TABLE_USERS =
  process.env.DYNAMODB_TABLE_USERS ?? "onboarding-users";
