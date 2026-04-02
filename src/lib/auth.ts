import { type NextRequest } from "next/server";

export function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get("x-user-id");
}

export function requireUserId(request: NextRequest): string {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    throw new Error("Missing X-User-Id header");
  }
  return userId;
}
