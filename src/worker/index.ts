import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { processAnalysisJob } from "./processor";
import type { AnalysisJob } from "~/types";

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const QUEUE_URL = process.env.SQS_ANALYSIS_QUEUE_URL!;
const POLL_INTERVAL_MS = 5000;

async function pollOnce(): Promise<boolean> {
  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 900, // 15 minutes
    }),
  );

  const messages = response.Messages ?? [];
  if (messages.length === 0) return false;

  for (const message of messages) {
    if (!message.Body || !message.ReceiptHandle) continue;

    const job = JSON.parse(message.Body) as AnalysisJob;
    console.log(
      `[worker] Processing ${job.type} analysis for repo ${job.repoId}`,
    );

    try {
      await processAnalysisJob(job);
      console.log(`[worker] Completed analysis for repo ${job.repoId}`);

      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );
    } catch (err) {
      console.error(`[worker] Failed analysis for repo ${job.repoId}:`, err);
      // Message will become visible again after visibility timeout
    }
  }

  return true;
}

async function main() {
  console.log("[worker] Analysis worker started, polling SQS...");

  // Run as a long-polling loop
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    try {
      const processed = await pollOnce();
      if (!processed) {
        // No messages, wait briefly before polling again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error("[worker] Poll error:", err);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

void main();
