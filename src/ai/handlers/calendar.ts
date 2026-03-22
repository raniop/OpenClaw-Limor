import { createEvent, listEvents } from "../../calendar";
import { sendCalendarInviteEmail } from "../../email";
import { createMeetingRequest } from "../../meetings";
import { findContactByName } from "../../contacts";
import { getNotifyOwnerCallback } from "../callbacks";
import { logAudit } from "../../audit/audit-log";
import { findAndDeleteEvent, deleteAllEventsOnDate } from "../../calendar";
import { addFollowup } from "../../followups/followup-store";
import type { ToolHandler } from "./types";

export const calendarHandlers: Record<string, ToolHandler> = {
  create_event: async (input, sender) => {
    if (!sender?.isOwner) {
      return "❌ רק רני יכול ליצור אירועים ביומן ישירות. השתמשי ב-request_meeting.";
    }
    const start = new Date(input.start_date);
    const durationMs = (input.duration_minutes || 60) * 60 * 1000;
    const end = new Date(start.getTime() + durationMs);
    const result = await createEvent(input.title, start, end);
    return `אירוע "${input.title}" נוצר בהצלחה ליום ${start.toLocaleDateString("he-IL")} בשעה ${start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  },

  delete_event: async (input, sender) => {
    if (!sender?.isOwner) {
      return "❌ רק רני יכול למחוק אירועים מהיומן.";
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
      return "❌ רק רני יכול לראות את היומן. אם את צריכה לדעת אם רני פנוי — השתמשי ב-notify_owner.";
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
      return `כבר שלחתי בקשה לרני בנושא הזה (${id}). מחכים לתשובה שלו – לא צריך לשלוח שוב.`;
    }

    return `בקשת פגישה נשלחה לרני (${id}). הוא יחזור עם זמן מתאים.`;
  },

  notify_owner: async (input) => {
    if (getNotifyOwnerCallback()) {
      getNotifyOwnerCallback()!(input.message).catch((err: any) =>
        console.error("Failed to notify owner:", err)
      );
    }
    return `ההודעה הועברה לרני.`;
  },

  send_calendar_invite: async (input) => {
    const startDate = new Date(input.start_date);
    const duration = input.duration_minutes || 60;
    await sendCalendarInviteEmail({
      to: input.email,
      title: input.title,
      startDate,
      durationMinutes: duration,
      description: "פגישה עם רני - נקבעה דרך לימור",
    });
    return `✅ זימון נשלח למייל ${input.email}! (הזמנת יומן)`;
  },

  create_reminder: async (input, sender) => {
    const dueHours = input.due_hours || 24;
    const dueAt = new Date(Date.now() + dueHours * 60 * 60 * 1000);
    const reason = `[מ-${input.from_name}] ${input.task}`;
    const requesterContact = findContactByName(input.from_name);
    const actor = sender?.name || "unknown";
    const entry = addFollowup(sender?.chatId || "", input.from_name, reason, dueAt, requesterContact?.chatId, input.from_name);
    logAudit(actor, "reminder_created", input.from_name, "success", { task: input.task });
    return `✅ תזכורת נוצרה!\n📝 ${input.task}\n👤 מבקש: ${input.from_name}\n⏰ עד: ${dueAt.toLocaleString("he-IL")}`;
  },
};
