import { NextResponse } from "next/server";
import {
  getConversation,
  getMessages,
  deleteConversation,
} from "~/lib/db/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conversation = await getConversation(id);

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const messages = await getMessages(id);
  return NextResponse.json({ ...conversation, messages });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteConversation(id);
  return NextResponse.json({ success: true });
}
