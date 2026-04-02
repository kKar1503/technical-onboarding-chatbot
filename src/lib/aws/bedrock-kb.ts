import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import type { KnowledgeChunk } from "~/types";

const runtimeClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const agentClient = new BedrockAgentClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export async function retrieveFromKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  topK = 5,
): Promise<KnowledgeChunk[]> {
  const response = await runtimeClient.send(
    new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: topK,
        },
      },
    }),
  );

  return (response.retrievalResults ?? []).map((result) => ({
    content: result.content?.text ?? "",
    source: result.location?.s3Location?.uri ?? "unknown",
    score: result.score ?? 0,
  }));
}

export async function startIngestionJob(
  knowledgeBaseId: string,
  dataSourceId: string,
): Promise<string> {
  const response = await agentClient.send(
    new StartIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
    }),
  );

  return response.ingestionJob?.ingestionJobId ?? "";
}
