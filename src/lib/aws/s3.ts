import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { KB_LAYOUT } from "~/lib/config";
import { contentTypeFor } from "~/lib/source-ingest";

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const bucket = process.env.KNOWLEDGE_S3_BUCKET ?? "onboarding-knowledge";

/** `knowledge/<repoId>/docs/<path>` — agent-written summary markdown. */
export async function uploadKnowledgeDoc(
  repoId: string,
  path: string,
  content: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `knowledge/${repoId}/${KB_LAYOUT.docsPrefix}/${path}`,
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
      Key: `knowledge/${repoId}/${KB_LAYOUT.docsPrefix}/${path}`,
    }),
  );
}

/** `knowledge/<repoId>/source/<relPath>` — raw source file mirrored from git. */
export async function uploadSourceFile(
  repoId: string,
  relPath: string,
  absPathOrBody: string | Buffer,
): Promise<void> {
  const body =
    typeof absPathOrBody === "string" && !Buffer.isBuffer(absPathOrBody)
      ? readFileSync(absPathOrBody)
      : absPathOrBody;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `knowledge/${repoId}/${KB_LAYOUT.sourcePrefix}/${relPath}`,
      Body: body,
      ContentType: contentTypeFor(relPath),
    }),
  );
}

export async function deleteSourceFile(
  repoId: string,
  relPath: string,
): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: `knowledge/${repoId}/${KB_LAYOUT.sourcePrefix}/${relPath}`,
    }),
  );
}
