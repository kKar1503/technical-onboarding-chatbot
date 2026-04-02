import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { AnalysisJob } from "~/types";

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

export async function sendAnalysisJob(job: AnalysisJob): Promise<void> {
  const queueUrl = process.env.SQS_ANALYSIS_QUEUE_URL;
  if (!queueUrl) throw new Error("SQS_ANALYSIS_QUEUE_URL not configured");

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(job),
      MessageGroupId: job.repoId,
    }),
  );
}
