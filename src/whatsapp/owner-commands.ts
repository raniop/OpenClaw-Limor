/**
 * Owner command handling — approval/rejection of contacts and meeting requests.
 * Meeting approval now delegates to the meeting state machine (code-enforced, not AI-prompted).
 */
import { parseOwnerCommand } from "../command-parser";
import { approvalStore } from "../stores";
import { log } from "../logger";
import type { TraceContext } from "../observability";
import { approveSpec, rejectSpec } from "../capabilities";
import { generateDailyDigest } from "../digest";
import { getMeetingById, approveMeeting, rejectMeeting } from "../meetings";
import { parseHebrewTime } from "../meetings";

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

  // --- Meeting approval by ID (state-machine enforced) ---
  if (cmd?.type === "approve_meeting") {
    const meeting = getMeetingById(cmd.id);
    if (!meeting) {
      await ctx.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
      return true;
    }

    // Parse date/time from extra text in owner's command
    let date: string | undefined;
    let time: string | undefined;

    if (cmd.extraText) {
      const parsed = parseHebrewTime(cmd.extraText);
      if (parsed) {
        date = parsed.date;
        time = parsed.time;
      }
    }

    // The state machine handles everything: create event + notify contact
    const result = await approveMeeting(cmd.id, date, time);

    if (result.needsDateTime) {
      await ctx.reply(`📅 באיזה תאריך ושעה?\nלמשל: *אשר פגישה ${cmd.id} מחר ב-14:00*`);
      return true;
    }

    if (!result.success) {
      await ctx.reply(`❌ ${result.error}`);
      return true;
    }

    // Success — event created + contact notified (all done by state machine)
    const dateFormatted = date
      ? new Date(`${date}T${time || "12:00"}:00`).toLocaleDateString("he-IL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";
    await ctx.reply(
      `✅ אושר! פגישה עם ${meeting.contactName} נקבעה${dateFormatted ? ` ל-${dateFormatted}` : ""}${time ? ` בשעה ${time}` : ""}.\nאירוע נוצר ביומן + הודעה נשלחה ל${meeting.contactName}.`
    );
    return true;
  }

  // --- Meeting rejection by ID (state-machine enforced) ---
  if (cmd?.type === "reject_meeting") {
    const meeting = getMeetingById(cmd.id);
    if (!meeting) {
      await ctx.reply(`❌ לא מצאתי בקשת פגישה עם קוד ${cmd.id}.`);
      return true;
    }

    // State machine handles: update state + notify contact
    const result = await rejectMeeting(cmd.id, cmd.reason);

    if (!result.success) {
      await ctx.reply(`❌ ${result.error}`);
      return true;
    }

    await ctx.reply(`🚫 דחיתי את בקשת הפגישה מ-${meeting.contactName} (${cmd.id}).`);
    return true;
  }

  // --- Capability approval/rejection ---
  if (cmd?.type === "approve_capability") {
    const spec = approveSpec(cmd.id);
    if (spec) {
      console.log(`[capability] Approved: ${spec.id} — ${spec.title}`);
      await ctx.reply(`✅ יכולת אושרה: **${spec.title}** (${spec.id})\n\n🤖 מתחילה לממש...`);

      // Auto-run implementation after approval
      try {
        const { runCapabilityImplementation } = require("../capabilities/capability-runner");
        const result = await runCapabilityImplementation(spec.id);
        await ctx.reply(result);
      } catch (err: any) {
        console.error(`[capability] Implementation failed:`, err);
        await ctx.reply(`❌ המימוש נכשל: ${err.message}`);
      }
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

  return false;
}
