import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockAgentClient,
  CreateDataSourceCommand,
  CreateKnowledgeBaseCommand,
  DeleteDataSourceCommand,
  DeleteKnowledgeBaseCommand,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import {
  S3VectorsClient,
  CreateIndexCommand,
  DeleteIndexCommand,
} from "@aws-sdk/client-s3vectors";
import { env } from "~/env";
import type { KnowledgeChunk } from "~/types";

const runtimeClient = new BedrockAgentRuntimeClient({ region: env.AWS_REGION });
const agentClient = new BedrockAgentClient({ region: env.AWS_REGION });
const s3VectorsClient = new S3VectorsClient({ region: env.AWS_REGION });

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
        vectorSearchConfiguration: { numberOfResults: topK },
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
    new StartIngestionJobCommand({ knowledgeBaseId, dataSourceId }),
  );
  return response.ingestionJob?.ingestionJobId ?? "";
}

// ---------------------------------------------------------------------------
// Per-repo KB provisioning (S3 Vectors backend)
// ---------------------------------------------------------------------------

interface ProvisionResult {
  knowledgeBaseId: string;
  dataSourceId: string;
  vectorIndexArn: string;
}

export async function createKnowledgeBaseForRepo(
  repoId: string,
  repoName: string,
  s3Prefix: string,
): Promise<ProvisionResult> {
  const indexName = `repo-${repoId}`.toLowerCase().slice(0, 63);

  // 1. Vector index inside the shared vector bucket.
  const createIndex = await s3VectorsClient.send(
    new CreateIndexCommand({
      vectorBucketName: env.VECTOR_BUCKET_NAME,
      indexName,
      dataType: "float32",
      dimension: env.EMBEDDING_DIMENSIONS,
      distanceMetric: "cosine",
    }),
  );
  const vectorIndexArn =
    createIndex.indexArn ?? `${env.VECTOR_BUCKET_ARN}/index/${indexName}`;

  // 2. Knowledge Base pointing at the index.
  const kb = await agentClient.send(
    new CreateKnowledgeBaseCommand({
      name: `repo-${repoName}-${repoId}`.slice(0, 100),
      roleArn: env.BEDROCK_KB_ROLE_ARN,
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${env.AWS_REGION}::foundation-model/${env.EMBEDDING_MODEL_ID}`,
        },
      },
      storageConfiguration: {
        type: "S3_VECTORS",
        s3VectorsConfiguration: {
          vectorBucketArn: env.VECTOR_BUCKET_ARN,
          indexArn: vectorIndexArn,
        },
      },
    }),
  );
  const knowledgeBaseId = kb.knowledgeBase?.knowledgeBaseId;
  if (!knowledgeBaseId) {
    throw new Error("Bedrock CreateKnowledgeBase returned no knowledgeBaseId");
  }

  // 3. Data source pointing at the repo's S3 prefix in the knowledge bucket.
  const ds = await agentClient.send(
    new CreateDataSourceCommand({
      knowledgeBaseId,
      name: `repo-${repoId}`,
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: env.KNOWLEDGE_BUCKET_ARN,
          inclusionPrefixes: [s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`],
        },
      },
    }),
  );
  const dataSourceId = ds.dataSource?.dataSourceId;
  if (!dataSourceId) {
    throw new Error("Bedrock CreateDataSource returned no dataSourceId");
  }

  return { knowledgeBaseId, dataSourceId, vectorIndexArn };
}

export async function deleteKnowledgeBaseForRepo(
  knowledgeBaseId: string | null,
  dataSourceId: string | null,
  vectorIndexArn: string | null,
): Promise<void> {
  // Reverse of creation; each step is best-effort so a half-torn-down repo
  // can still be cleaned up on a second attempt.
  if (dataSourceId && knowledgeBaseId) {
    try {
      await agentClient.send(
        new DeleteDataSourceCommand({ knowledgeBaseId, dataSourceId }),
      );
    } catch (err) {
      console.warn("[kb] delete data source failed", err);
    }
  }
  if (knowledgeBaseId) {
    try {
      await agentClient.send(
        new DeleteKnowledgeBaseCommand({ knowledgeBaseId }),
      );
    } catch (err) {
      console.warn("[kb] delete knowledge base failed", err);
    }
  }
  if (vectorIndexArn) {
    const indexName = vectorIndexArn.split("/").pop();
    if (indexName) {
      try {
        await s3VectorsClient.send(
          new DeleteIndexCommand({
            vectorBucketName: env.VECTOR_BUCKET_NAME,
            indexName,
          }),
        );
      } catch (err) {
        console.warn("[kb] delete vector index failed", err);
      }
    }
  }
}
