import { NextResponse } from "next/server";
import { getContacts } from "@/lib/data";

const TEST_PHONES = new Set(["111", "222", "333"]);
const TEST_CHAT_IDS = new Set(["chat1@lid", "chat2@lid", "chat3@lid"]);

export async function GET() {
  const contacts = getContacts().filter(
    (c) => !TEST_PHONES.has(c.phone) && !TEST_CHAT_IDS.has(c.chatId)
  );
  return NextResponse.json(contacts);
}
