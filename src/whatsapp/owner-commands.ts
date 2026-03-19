/**
 * Owner command handling — approval/rejection of contacts and meeting requests.
 */
import { sendMessage } from "../ai";
import { parseOwnerCommand } from "../command-parser";
import { getMemoryContext } from "../memory";
import { approvalStore, meetingStore, conversationStore } from "../stores";
import { log } from "../logger";
import type { TraceContext } from "../observability";
import { approveSpec, rejectSpec, getSpec } from "../capabilities";
import { generateDailyDigest } from "../digest";

interface OwnerCommandContext {
  chatId: string;
  body: string;
  reply: (text: string) => Promise<void>;
  sendToChat: (targetChatId: string, text: string) => Promise<void>;
  trace?: TraceContext;
}

/**
 * Handle owner commands (approval, rejection, meeting responses).
 * Returns true if a command was handled, false if the message should continue to normal AI processing.
 */
export async function handleOwnerCommand(ctx: OwnerCommandContext): Promise<boolean> {
  const cmd = parseOwnerCommand(ctx.body);

  // --- Contact approval by code ---
  if (cmd?.type === "approve_contact") {
    const entry = approvalStore.approveByCode(cmd.code);
    if (entry) {
      log.approvalApproved(cmd.code, entry.phone, ctx.trace);
      await ctx.reply(`✅ אישרתי את ${entry.phone}! (קוד: ${cmd.code}) עכשיו הם יכולים לדבר איתי.`);
      await ctx.sendToChat(entry.chatId, "🎉 אושרת! אני לימור, איך אפשר לעזור? 😊");
    } else {
      log.approvalNotFound(cmd.code, ctx.trace);
      await ctx.reply(`❌ לא מצאתי בקשה עם קוד ${cmd.code}.`);
    }
    return true;
  }

  // --- Contact rejection by code ---
  if (cmd?.type === "reject_contact") {
    const entry = approvalStore.rejectByCode(cmd.code);
    if (entry) {
      log.approvalRejected(cmd.code, entry.phone, ctx.trace);
      await ctx.reply(`🚫 דחיתי את ${entry.phone} (קוד: ${cmd.code}).`);
    } else {
      log.approvalNotFound(cmd.code, ctx.trace);
      await ctx.reply(`❌ לא מצאתי בקשה עם קוד ${cmd.code}.`);
    }
    return true;
  }

  // --- Bare approve (legacy fallback) ---
  if (cmd?.type === "bare_approve") {
    const pendingCount = approvalStore.getPendingCount();
    if (pendingCount === 1) {
      const pending = approvalStore.getLastPending();
      if (pending) {
        const entry = approvalStore.approveByCode(pending.code);
        if (entry) {
          await ctx.reply(`✅ אישרתי את ${entry.phone}! עכשיו הם יכולים לדבר איתי.`);
          await ctx.sendToChat(entry.chatId, "🎉 אושרת! אני לימור, איך אפשר לעזור? 😊");
          return true;
        }
      }
    } else if (pendingCount > 1) {
      log.approvalAmbiguous(pendingCount, ctx.trace);
      const pending = approvalStore.getLastPending();
      await ctx.reply(`⚠️ יש ${pendingCount} בקשות ממתינות. תציין קוד:\nלמשל: *אשר ${pending?.code || "XXXXXX"}*`);
      return true;
    }
    // pendingCount === 0: fall through
  }

  // --- Meeting approval by ID ---
  if (cmd?.type === "approve_meeting") {
    const meetingReq = meetingStore.getMeetingRequestById(cmd.id);
    if (!meetingReq) {
      await ctx.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
      return true;
    }
    await handleMeetingResponse(ctx.chatId, ctx.body, meetingReq, ctx.reply);
    meetingStore.removeMeetingRequest(meetingReq.id);
    return true;
  }

  // --- Meeting rejection by ID ---
  if (cmd?.type === "reject_meeting") {
    const req = meetingStore.removeMeetingRequest(cmd.id);
    if (req) {
      await ctx.reply(`🚫 דחיתי את בקשת הפגישה מ-${req.requesterName} (${cmd.id}).`);
    } else {
      await ctx.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
    }
    return true;
  }

  // --- Capability approval/rejection ---
  if (cmd?.type === "approve_capability") {
    const spec = approveSpec(cmd.id);
    if (spec) {
      console.log(`[capability] Approved: ${spec.id} — ${spec.title}`);
      await ctx.reply(`✅ יכולת אושרה: **${spec.title}** (${spec.id})\n\nהשלב הבא: לממש את השינוי. אני אזדקק לעזרה מהמפתח כדי ליישם את הפתרון המוצע.`);
    } else {
      await ctx.reply(`❌ לא מצאתי בקשת יכולת עם מזהה ${cmd.id}`);
    }
    return true;
  }

  if (cmd?.type === "reject_capability") {
    const spec = rejectSpec(cmd.id);
    if (spec) {
      console.log(`[capability] Rejected: ${spec.id} — ${spec.title}`);
      await ctx.reply(`🚫 בקשת יכולת נדחתה: **${spec.title}** (${spec.id})`);
    } else {
      await ctx.reply(`❌ לא מצאתי בקשת יכולת עם מזהה ${cmd.id}`);
    }
    return true;
  }

  // --- Digest command ---
  if (cmd?.type === "digest") {
    const digest = await generateDailyDigest();
    await ctx.reply(digest);
    return true;
  }

  // --- Legacy: if exactly 1 meeting request, treat any owner message as response ---
  const meetingCount = meetingStore.getMeetingRequestCount();
  if (meetingCount === 1) {
    const meetingReq = meetingStore.getLastMeetingRequest();
    if (meetingReq) {
      await handleMeetingResponse(ctx.chatId, ctx.body, meetingReq, ctx.reply);
      meetingStore.removeMeetingRequest(meetingReq.id);
      return true;
    }
  }

  return false;
}

/** Send owner's response to AI with meeting context injected. */
async function handleMeetingResponse(
  chatId: string,
  body: string,
  meetingReq: { requesterName: string; requesterChatId: string; topic: string; preferredTime?: string; id: string },
  reply: (text: string) => Promise<void>
): Promise<void> {
  conversationStore.addMessage(chatId, "user", body);
  const memoryContext = getMemoryContext(chatId);
  const history = conversationStore.getHistory(chatId);
  const meetingContext = `\n\nהקשר: יש בקשת פגישה פתוחה (${meetingReq.id}) מ-${meetingReq.requesterName} (chatId: ${meetingReq.requesterChatId}) בנושא "${meetingReq.topic}"${meetingReq.preferredTime ? ` (זמן מועדף: ${meetingReq.preferredTime})` : ""}. רני עכשיו עונה לגבי הזמינות שלו. אם הוא אישר או נתן תאריך ושעה – עשי את שני הדברים האלה: (1) קבעי את הפגישה ביומן עם create_event (2) שלחי הודעה ל-${meetingReq.requesterName} עם send_message שרני אישר ומתי הפגישה. חשוב: עשי את שניהם!`;
  const response = await sendMessage(history, (memoryContext || "") + meetingContext, { chatId, name: "רני", isOwner: true });
  conversationStore.addMessage(chatId, "assistant", response);
  await reply(response);
}
