import { createEvent, listEvents } from "../../calendar";
import { sendCalendarInviteEmail } from "../../email";
import { config } from "../../config";
import { createMeetingRequest } from "../../meetings";
import { findContactByName } from "../../contacts";
import { getNotifyOwnerCallback } from "../callbacks";
import { logAudit } from "../../audit/audit-log";
import { findAndDeleteEvent, deleteAllEventsOnDate } from "../../calendar";
import { addFollowup, getPendingFollowups, deleteFollowup, deleteFollowupByKeyword } from "../../followups/followup-store";
import type { ToolHandler } from "./types";

/**
 * Parse a due_at string into a Date. Supports:
 * - "HH:MM" → today at that time in Asia/Jerusalem
 * - "YYYY-MM-DD HH:MM" → specific date+time in Asia/Jerusalem
 * - ISO string → direct parse
 */
function parseDueAt(dueAt: string): Date {
  const trimmed = dueAt.trim();

  // "HH:MM" format — today in Israel timezone
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hour = parseInt(hhmm[1]);
    const min = parseInt(hhmm[2]);
    // Build date in Israel timezone
    const nowIsrael = new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
    const israelDate = new Date(nowIsrael);
    israelDate.setHours(hour, min, 0, 0);
    // Convert back to UTC: get Israel offset
    const utcTarget = new Date(israelDate.getTime());
    // Recalculate: Israel is UTC+2 or UTC+3 (DST)
    const israelOffset = getIsraelOffsetMs();
    const utcDate = new Date(israelDate.getTime() - israelOffset + new Date().getTimezoneOffset() * 60000);
    // Simpler approach: use Intl to get the right time
    return buildIsraelDate(new Date(), hour, min);
  }

  // "YYYY-MM-DD HH:MM" format
  const dateTime = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (dateTime) {
    const [, dateStr, hourStr, minStr] = dateTime;
    const baseDate = new Date(dateStr + "T00:00:00");
    return buildIsraelDate(baseDate, parseInt(hourStr), parseInt(minStr));
  }

  // ISO string or other parseable format
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;

  // Fallback: 24 hours from now
  console.warn(`[create_reminder] Could not parse due_at: "${dueAt}", falling back to 24h`);
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

/** Build a UTC Date from Israel local hour:minute */
function buildIsraelDate(baseDate: Date, hour: number, min: number): Date {
  // Get today's date string in Israel
  const israelDateStr = baseDate.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }); // YYYY-MM-DD
  // Create an ISO string at the desired Israel time, then let JS handle TZ
  // Israel is UTC+2 (winter) or UTC+3 (summer/DST)
  const israelOffset = getIsraelOffsetMs();
  const target = new Date(`${israelDateStr}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`);
  // Subtract Israel offset to get real UTC
  return new Date(target.getTime() - israelOffset);
}

function getIsraelOffsetMs(): number {
  // Use Intl to determine current Israel offset
  const now = new Date();
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const israelStr = now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" });
  return new Date(israelStr).getTime() - new Date(utcStr).getTime();
}

export const calendarHandlers: Record<string, ToolHandler> = {
  create_event: async (input, sender) => {
    if (!sender?.isOwner) {
      return `❌ רק ${config.ownerName} יכול ליצור אירועים ביומן ישירות. השתמשי ב-request_meeting.`;
    }
    const start = new Date(input.start_date);
    const durationMs = (input.duration_minutes || 60) * 60 * 1000;
    const end = new Date(start.getTime() + durationMs);
    const result = await createEvent(input.title, start, end);
    return `אירוע "${input.title}" נוצר בהצלחה ליום ${start.toLocaleDateString("he-IL")} בשעה ${start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  },

  delete_event: async (input, sender) => {
    if (!sender?.isOwner) {
      return `❌ רק ${config.ownerName} יכול למחוק אירועים מהיומן.`;
    }
    const date = new Date(input.date);
    if (input.title) {
      return await findAndDeleteEvent(date, input.title);
    } else {
      return await deleteAllEventsOnDate(date);
    }
  },

  list_events: async (input, sender) => {
    if (!sender?.isOwner) {
      return `❌ רק ${config.ownerName} יכול לראות את היומן. אם את צריכה לדעת אם ${config.ownerName} פנוי — השתמשי ב-notify_owner.`;
    }
    const date = new Date(input.date);
    return await listEvents(date);
  },

  request_meeting: async (input, sender) => {
    if (sender?.isOwner) {
      return "❌ אתה הבעלים — השתמש ב-create_event ישירות כדי לקבוע אירוע ביומן.";
    }

    const contactName = sender?.name || "מישהו";
    const chatId = sender?.chatId || "";

    const { id, alreadyPending } = await createMeetingRequest(
      chatId,
      contactName,
      input.topic,
      input.preferred_time
    );

    if (alreadyPending) {
      return `כבר שלחתי בקשה ל${config.ownerName} בנושא הזה (${id}). מחכים לתשובה שלו – לא צריך לשלוח שוב.`;
    }

    return `בקשת פגישה נשלחה ל${config.ownerName} (${id}). הוא יחזור עם זמן מתאים.`;
  },

  notify_owner: async (input) => {
    if (getNotifyOwnerCallback()) {
      getNotifyOwnerCallback()!(input.message).catch((err: any) =>
        console.error("Failed to notify owner:", err)
      );
    }
    return `ההודעה הועברה ל${config.ownerName}.`;
  },

  send_calendar_invite: async (input) => {
    const startDate = new Date(input.start_date);
    const duration = input.duration_minutes || 60;
    await sendCalendarInviteEmail({
      to: input.email,
      title: input.title,
      startDate,
      durationMinutes: duration,
      description: `פגישה עם ${config.ownerName} - נקבעה דרך ${config.botName}`,
    });
    return `✅ זימון נשלח למייל ${input.email}! (הזמנת יומן)`;
  },

  create_reminder: async (input, sender) => {
    // --- Parse due time ---
    let dueAt: Date;
    if (input.due_at) {
      dueAt = parseDueAt(input.due_at);
    } else {
      const dueHours = input.due_hours || 24;
      dueAt = new Date(Date.now() + dueHours * 60 * 60 * 1000);
    }

    const reason = `[מ-${input.from_name}] ${input.task}`;
    const requesterContact = findContactByName(input.from_name);
    const actor = sender?.name || "unknown";

    // --- Resolve target contact (who receives the reminder) ---
    let targetChatId: string | undefined;
    let targetName: string | undefined;
    let targetMessage: string | undefined;

    if (input.target_contact) {
      const target = findContactByName(input.target_contact);
      if (target) {
        targetChatId = target.chatId;
        // If chatId is manual_, use phone-based chatId
        if (targetChatId.startsWith("manual_")) {
          const phone = target.phone?.replace(/\D/g, "");
          if (phone) targetChatId = `${phone}@c.us`;
          else targetChatId = undefined; // Can't send
        }
        targetName = target.name;
      }
      targetMessage = input.message || input.task;
    }

    const entry = addFollowup(
      sender?.chatId || "", input.from_name, reason, dueAt,
      requesterContact?.chatId, input.from_name,
      targetChatId, targetName, targetMessage
    );

    // Dedup — already exists
    if (!entry) {
      const timeStr = dueAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
      return `ℹ️ כבר קיימת תזכורת דומה לזמן הזה (${timeStr}) — לא נוצרה כפילות.`;
    }

    logAudit(actor, "reminder_created", input.from_name, "success", { task: input.task, targetName });

    // --- Also add to calendar when there is a concrete due_at for the owner ---
    // Skipped for reminders routed to other contacts, or when the time is vague
    // (due_hours only — often a fuzzy "in 24h" that doesn't belong in a calendar).
    // Can be opted out explicitly with add_to_calendar: false.
    let calendarNote = "";
    const wantsCalendar = input.add_to_calendar !== false;
    const hasConcreteTime = !!input.due_at;
    const isForOwner = !targetChatId;
    const calendarEnabled = config.owner.integrations.appleCalendar || config.owner.integrations.googleCalendar;
    if (wantsCalendar && hasConcreteTime && isForOwner && calendarEnabled) {
      try {
        const endDate = new Date(dueAt.getTime() + 30 * 60 * 1000);
        const eventTitle = `⏰ ${input.task}`;
        const result = await createEvent(eventTitle, dueAt, endDate);
        const resultStr = typeof result === "string" ? result : (result as any)?.message || "";
        if (!resultStr.startsWith("❌")) {
          calendarNote = "\n📅 נוסף גם ליומן";
        } else {
          console.warn("[create_reminder] Calendar add failed:", resultStr);
        }
      } catch (err) {
        console.warn("[create_reminder] Calendar add threw:", err);
      }
    }

    const timeStr = dueAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const targetStr = targetName ? `\n📨 נשלח ל: ${targetName}` : "";
    return `✅ תזכורת נוצרה!\n📝 ${input.task}\n👤 מבקש: ${input.from_name}\n⏰ זמן: ${timeStr}${targetStr}${calendarNote}`;
  },

  list_reminders: async () => {
    const pending = getPendingFollowups();
    if (pending.length === 0) return "אין תזכורות ממתינות.";

    const lines = pending.map((f, i) => {
      const task = f.reason.replace(/^\[מ-[^\]]*\]\s*/, "");
      const time = new Date(f.dueAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
      const recipient = f.targetName ? `📨 נשלח ל: ${f.targetName}` : `📨 נשלח ל: הבעלים (${config.ownerName})`;
      return `${i + 1}. 📝 ${task}\n   ${recipient}\n   ⏰ ${time} | 🆔 ${f.id}`;
    });
    return `📋 *תזכורות ממתינות (${pending.length}):*\n\n${lines.join("\n\n")}`;
  },

  delete_reminder: async (input, sender) => {
    const actor = sender?.name || "unknown";
    let removed;

    if (input.id) {
      removed = deleteFollowup(input.id);
    } else if (input.keyword) {
      removed = deleteFollowupByKeyword(input.keyword);
    } else {
      return "❌ צריך לציין ID או מילת חיפוש למחיקה.";
    }

    if (!removed) return "❌ לא מצאתי תזכורת מתאימה למחיקה.";

    const task = removed.reason.replace(/^\[מ-[^\]]*\]\s*/, "");
    logAudit(actor, "reminder_deleted", task, "success");
    return `✅ תזכורת נמחקה: "${task}"`;
  },
};
