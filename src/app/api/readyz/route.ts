import { NextResponse } from "next/server";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { GetQueueAttributesCommand, SQSClient } from "@aws-sdk/client-sqs";
import { docClient, TABLE_USERS } from "~/lib/aws/dynamodb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// Deep readiness probe: verifies core AWS dependencies are reachable.
// NOT wired to the ALB target group — call on-demand (canary, debug, CI)
// to avoid every 30s healthcheck paying for two AWS round-trips and
// turning a dependency blip into a capacity loss.
export async function GET() {
  const checks: Record<string, string> = {};

  await Promise.all([
    docClient
      .send(new DescribeTableCommand({ TableName: TABLE_USERS }))
      .then(() => {
        checks.dynamodb = "ok";
      })
      .catch((e: Error) => {
        checks.dynamodb = e.message;
      }),
    (async () => {
      const url = process.env.SQS_ANALYSIS_QUEUE_URL;
      if (!url) {
        checks.sqs = "SQS_ANALYSIS_QUEUE_URL not set";
        return;
      }
      await sqs
        .send(
          new GetQueueAttributesCommand({
            QueueUrl: url,
            AttributeNames: ["QueueArn"],
          }),
        )
        .then(() => {
          checks.sqs = "ok";
        })
        .catch((e: Error) => {
          checks.sqs = e.message;
        });
    })(),
  ]);

  const healthy = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
