/**
 * Daily executive digest generator.
 * Produces a short, human, actionable morning briefing.
 * Like a real assistant telling you what matters TODAY.
 */
import { approvalStore } from "../stores";
import { getPendingMeetings } from "../meetings";
import { getPendingFollowups, getDueFollowups } from "../followups";
import { listEvents } from "../calendar";
import type { DigestData } from "./digest-types";
import { saveDigest } from "./digest-history";

/** Generic/empty followup reasons to skip */
const JUNK_REASONS = new Set(["עדכון", "מעקב", "follow up", "followup", "update", ""]);

function isJunk(reason: string): boolean {
  const trimmed = reason.trim().toLowerCase();
  return JUNK_REASONS.has(trimmed) || trimmed.length < 5;
}

/**
 * Generate a short, actionable morning briefing.
 */
export async function generateDailyDigest(): Promise<string> {
  const lines: string[] = [];
  lines.push("בוקר טוב רני! ☀️\n");

  const data: DigestData = {
    urgent: [], waiting: [], newContacts: [], meetings: [],
    capabilities: [], followups: [], calendar: [], recentActivity: [], insights: [],
  };

  // --- Birthdays & calendar events for TODAY ---
  let todayEvents: string[] = [];
  let tomorrowEvents: string[] = [];
  try {
    const today = new Date();
    const todayRaw = await listEvents(today);
    if (todayRaw && !todayRaw.includes("אין אירועים")) {
      todayEvents = todayRaw.split("\n").filter(l => l.trim());
    }
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowRaw = await listEvents(tomorrow);
    if (tomorrowRaw && !tomorrowRaw.includes("אין אירועים")) {
      tomorrowEvents = tomorrowRaw.split("\n").filter(l => l.trim());
    }
  } catch {}

  // Extract birthdays
  const birthdays = todayEvents.filter(e =>
    /יום הולדת|יומולדת|birthday/i.test(e)
  );
  const regularEvents = todayEvents.filter(e =>
    !/יום הולדת|יומולדת|birthday/i.test(e)
  );

  // Birthdays first — they're special!
  for (const bday of birthdays) {
    const name = bday.replace(/^.*?-\s*/, "").replace(/יום הולדת (של |ל)?/i, "").replace(/יומולדת (ל)?/i, "").trim();
    lines.push(`🎂 היום יום הולדת ל${name}!`);
  }
  if (birthdays.length > 0) lines.push("");

  // --- What needs your attention ---
  const actionItems: string[] = [];

  // Overdue followups
  const overdue = getDueFollowups().filter(fu => !isJunk(fu.reason));
  for (const fu of overdue) {
    actionItems.push(`לחזור ל${fu.contactName} — ${fu.reason}`);
  }

  // Pending followups (not overdue)
  const pending = getPendingFollowups().filter(fu =>
    !isJunk(fu.reason) && !overdue.find(o => o.id === fu.id)
  );
  for (const fu of pending) {
    actionItems.push(`${fu.contactName} — ${fu.reason}`);
  }

  // Pending approvals
  const pendingCount = approvalStore.getPendingCount();
  if (pendingCount > 0) {
    actionItems.push(`${pendingCount} אנשי קשר ממתינים לאישור`);
  }

  // Pending meetings
  const pendingMeetings = getPendingMeetings();
  for (const m of pendingMeetings) {
    actionItems.push(`לאשר/לדחות פגישה עם ${m.contactName} (${m.topic})`);
  }

  if (actionItems.length > 0) {
    lines.push("📌 *מה מחכה לך:*");
    for (const item of actionItems) {
      lines.push(`• ${item}`);
    }
    lines.push("");
  }

  // --- Today's schedule (non-birthday events) ---
  if (regularEvents.length > 0) {
    lines.push("🗓️ *היום:*");
    for (const event of regularEvents) {
      lines.push(`• ${event}`);
    }
    lines.push("");
  }

  // --- Tomorrow preview (brief) ---
  if (tomorrowEvents.length > 0) {
    lines.push("📅 *מחר:*");
    for (const event of tomorrowEvents.slice(0, 3)) {
      lines.push(`• ${event}`);
    }
    lines.push("");
  }

  // --- Nothing? Say so ---
  if (actionItems.length === 0 && regularEvents.length === 0 && birthdays.length === 0) {
    lines.push("✨ הכל שקט! אין דברים דחופים. יום טוב! 🙌\n");
  } else if (actionItems.length === 0) {
    lines.push("אין דברים דחופים. יום טוב! 🙌");
  }

  // Save to history for dashboard
  const digestText = lines.join("\n");
  saveDigest(digestText, {
    urgentCount: overdue.length,
    waitingCount: pending.length,
    meetingsCount: pendingMeetings.length,
    followupsCount: pending.length + overdue.length,
  });

  // Store data for DigestData compatibility
  data.urgent = actionItems;
  data.calendar = todayEvents;
  data.followups = pending.map(fu => fu.reason);
  data.meetings = pendingMeetings.map(m => m.topic);

  return digestText;
}
