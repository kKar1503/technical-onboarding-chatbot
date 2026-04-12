import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Shallow liveness probe for the ALB target group. Hits only process health;
// dependency reachability is covered by /api/readyz and CloudWatch alarms so
// a transient DynamoDB/SQS blip doesn't drain healthy Next.js tasks.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
