import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import {
  createConversation,
  listConversationsByUser,
} from "~/lib/db/conversations";
import { requireUserId } from "~/lib/auth";
import type { ChatMode } from "~/types";

export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const conversations = await listConversationsByUser(userId);
    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json(
      { error: "Missing X-User-Id header" },
      { status: 401 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    const body = (await request.json()) as {
      repoId: string;
      mode: ChatMode;
      title?: string;
    };

    const conversation = {
      id: nanoid(),
      userId,
      repoId: body.repoId,
      title: body.title ?? "New conversation",
      mode: body.mode,
      createdAt: new Date().toISOString(),
    };

    await createConversation(conversation);
    return NextResponse.json(conversation, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
