import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const bucket = process.env.KNOWLEDGE_S3_BUCKET ?? "onboarding-knowledge";

export async function uploadKnowledgeDoc(
  repoId: string,
  path: string,
  content: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `knowledge/${repoId}/${path}`,
      Body: content,
      ContentType: "text/markdown",
    }),
  );
}

export async function deleteKnowledgeDoc(
  repoId: string,
  path: string,
): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: `knowledge/${repoId}/${path}`,
    }),
  );
}
