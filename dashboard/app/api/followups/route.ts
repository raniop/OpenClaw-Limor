import { NextRequest, NextResponse } from "next/server";
import { getFollowups, completeFollowup } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getFollowups());
}

export async function POST(request: NextRequest) {
  const { id, action } = await request.json();
  if (!id || action !== "complete") {
    return NextResponse.json({ error: "Missing id or invalid action" }, { status: 400 });
  }

  // Get followup details before completing (for notification)
  const allFollowups = getFollowups();
  const followup = allFollowups.find((f) => f.id === id);

  const success = completeFollowup(id);

  // If followup has a requester, notify them via WhatsApp
  if (success && followup?.requesterChatId) {
    try {
      // Extract the task from reason (remove "[מ-name] " prefix)
      const task = followup.reason.replace(/^\[מ-[^\]]+\]\s*/, "");
      const message = `היי ${followup.requesterName || ""} 👋\nרציתי לעדכן אותך שרני טיפל בבקשה שלך:\n✅ ${task}`;

      // Send via the bot's QR server (which has the WhatsApp client)
      // We use the bot's send_message callback indirectly by writing to a notification file
      const { writeFileSync } = require("fs");
      const { resolve } = require("path");
      const notifyPath = resolve(process.cwd(), "..", "workspace", "state", "pending-notifications.json");

      let notifications: any[] = [];
      try {
        notifications = JSON.parse(require("fs").readFileSync(notifyPath, "utf-8"));
      } catch {}

      notifications.push({
        chatId: followup.requesterChatId,
        message,
        createdAt: new Date().toISOString(),
      });

      writeFileSync(notifyPath, JSON.stringify(notifications, null, 2), "utf-8");
    } catch (err) {
      console.error("[followup] Failed to queue notification:", err);
    }
  }

  return NextResponse.json({ success, notified: !!followup?.requesterChatId });
}
