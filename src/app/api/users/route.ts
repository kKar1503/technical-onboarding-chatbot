import { NextResponse } from "next/server";
import { listUsers } from "~/lib/db/users";

export async function GET() {
  const users = await listUsers();
  return NextResponse.json(users);
}
