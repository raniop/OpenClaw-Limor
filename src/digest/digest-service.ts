/**
 * Daily executive digest generator.
 * Collects data from all stores and produces a structured Hebrew summary.
 * Focused on signal over noise — actionable items only.
 */
import { approvalStore } from "../stores";
import { getPendingMeetingCount, getPendingMeetings } from "../meetings";
import { getPendingFollowups, getDueFollowups } from "../followups";
import { getRecentActivity } from "../audit/audit-log";
import { getRecentContacts } from "../contacts";
import { listEvents } from "../calendar";
import { getDailySummaries } from "./daily-summaries";
import type { DigestData } from "./digest-types";
import { saveDigest } from "./digest-history";

/** Generic/empty followup reasons to skip */
const JUNK_FOLLOWUP_REASONS = new Set([
  "עדכון",
  "מעקב",
  "follow up",
  "followup",
  "update",
  "",
]);

/** Audit actions worth showing in the digest */
const MEANINGFUL_ACTIONS = new Set([
  "message_sent",
  "meeting_approved",
  "meeting_rejected",
  "meeting_request",
  "contact_added_and_approved",
  "contact_deleted",
  "reminder_created",
]);

/**
 * Generate a comprehensive daily digest for the owner.
 * Also stores the digest in history for dashboard viewing.
 */
export async function generateDailyDigest(): Promise<string> {
  const data: DigestData = {
    urgent: [],
    waiting: [],
    newContacts: [],
    meetings: [],
    capabilities: [],
    followups: [],
    calendar: [],
    recentActivity: [],
    insights: [],
  };

  // --- Urgent: overdue followups (only meaningful ones) ---
  const overdueFollowups = getDueFollowups().filter(
    (fu) => !JUNK_FOLLOWUP_REASONS.has(fu.reason.trim().toLowerCase()) && fu.reason.trim().length > 2
  );
  for (const fu of overdueFollowups) {
    data.urgent.push(`מעקב באיחור: ${fu.contactName} — ${fu.reason}`);
  }

  // --- Pending approvals ---
  const pendingCount = approvalStore.getPendingCount();
  if (pendingCount > 0) {
    data.urgent.push(`${pendingCount} אנשי קשר ממתינים לאישור`);
  }

  // --- Pending meetings (from state machine) ---
  const pendingMeetingsList = getPendingMeetings();
  if (pendingMeetingsList.length > 0) {
    for (const m of pendingMeetingsList) {
      data.meetings.push(`${m.contactName}: ${m.topic}`);
    }
    data.urgent.push(`${pendingMeetingsList.length} בקשות פגישה ממתינות`);
  }

  // --- Followups: grouped by contact, skip junk reasons ---
  const pendingFollowups = getPendingFollowups().filter(
    (fu) => !JUNK_FOLLOWUP_REASONS.has(fu.reason.trim().toLowerCase()) && fu.reason.trim().length > 2
  );

  // Group by contact name
  const followupsByContact = new Map<string, typeof pendingFollowups>();
  for (const fu of pendingFollowups) {
    if (overdueFollowups.find((o) => o.id === fu.id)) continue; // already in urgent
    const list = followupsByContact.get(fu.contactName) || [];
    list.push(fu);
    followupsByContact.set(fu.contactName, list);
  }

  for (const [contactName, fus] of followupsByContact) {
    const items = fus.map((fu) => {
      const dueDate = new Date(fu.dueAt);
      const dueStr = dueDate.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
      return `${fu.reason} (עד ${dueStr})`;
    });
    data.followups.push(`*${contactName}:* ${items.join(" | ")}`);
  }

  // --- Calendar: today + tomorrow (keep as-is) ---
  try {
    const today = new Date();
    const todayEvents = await listEvents(today);
    if (todayEvents && !todayEvents.includes("אין אירועים")) {
      data.calendar.push(`📅 היום:\n${todayEvents}`);
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEvents = await listEvents(tomorrow);
    if (tomorrowEvents && !tomorrowEvents.includes("אין אירועים")) {
      data.calendar.push(`📅 מחר:\n${tomorrowEvents}`);
    }
  } catch {
    data.calendar.push("⚠️ לא הצלחתי לטעון את היומן");
  }

  // --- Contacts: only those who interacted today, with message count ---
  const todaySummaries = getDailySummaries();
  let totalConversations = 0;
  if (todaySummaries && todaySummaries.summaries.length > 0) {
    totalConversations = todaySummaries.summaries.length;
    for (const s of todaySummaries.summaries.slice(0, 5)) {
      data.newContacts.push(`${s.contactName} (${s.messageCount} הודעות)`);
    }
  } else {
    // Fallback: recent contacts from last 24h
    const recentContacts = getRecentContacts(10);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayContacts = recentContacts.filter((c) => new Date(c.lastSeen) > oneDayAgo);
    totalConversations = todayContacts.length;
    for (const c of todayContacts.slice(0, 5)) {
      data.newContacts.push(c.name);
    }
  }

  // --- Recent activity: only meaningful actions, max 5 ---
  const recentAudit = getRecentActivity(20);
  let activityCount = 0;
  for (const entry of recentAudit.reverse()) {
    if (activityCount >= 5) break;
    if (!MEANINGFUL_ACTIONS.has(entry.action)) continue;
    const time = new Date(entry.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const label = formatActionLabel(entry.action, entry.target);
    data.recentActivity.push(`${time} — ${label}`);
    activityCount++;
  }

  // --- Insights ---
  if (overdueFollowups.length > 0) {
    data.insights.push(`יש ${overdueFollowups.length} מעקבים שעבר הזמן שלהם — כדאי לטפל`);
  }
  if (pendingCount > 0 && pendingMeetingsList.length > 0) {
    data.insights.push("יש גם אישורים וגם פגישות ממתינים — כדאי לפנות זמן היום");
  }

  // --- Count calendar events for summary line ---
  let calendarEventCount = 0;
  for (const cal of data.calendar) {
    // Count lines that look like events (start with time or bullet)
    const lines = cal.split("\n").filter((l) => l.trim() && !l.startsWith("📅") && !l.startsWith("⚠️"));
    calendarEventCount += lines.length;
  }

  // --- Build digest text ---
  const digestText = formatDigest(data, {
    totalConversations,
    openFollowups: pendingFollowups.length + overdueFollowups.length,
    calendarEvents: calendarEventCount,
  });

  // Save to history for dashboard
  saveDigest(digestText, {
    urgentCount: data.urgent.length,
    waitingCount: data.waiting.length,
    meetingsCount: data.meetings.length,
    followupsCount: data.followups.length,
  });

  return digestText;
}

/** Human-readable Hebrew label for audit actions */
function formatActionLabel(action: string, target: string): string {
  switch (action) {
    case "message_sent":
      return `הודעה נשלחה ל${target}`;
    case "meeting_approved":
      return `פגישה אושרה: ${target}`;
    case "meeting_rejected":
      return `פגישה נדחתה: ${target}`;
    case "meeting_request":
      return `בקשת פגישה מ${target}`;
    case "contact_added_and_approved":
      return `איש קשר חדש: ${target}`;
    case "contact_deleted":
      return `איש קשר נמחק: ${target}`;
    case "reminder_created":
      return `תזכורת נוצרה: ${target}`;
    default:
      return `${action}: ${target}`;
  }
}

interface SummaryStats {
  totalConversations: number;
  openFollowups: number;
  calendarEvents: number;
}

function formatDigest(data: DigestData, stats: SummaryStats): string {
  const sections: string[] = [];

  sections.push("בוקר טוב רני! ☀️\n");

  if (data.urgent.length > 0) {
    sections.push("🔥 *דחוף:*");
    sections.push(data.urgent.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  if (data.calendar.length > 0) {
    sections.push("🗓️ *יומן:*");
    sections.push(data.calendar.join("\n"));
    sections.push("");
  }

  if (data.meetings.length > 0) {
    sections.push("📅 *פגישות ממתינות:*");
    sections.push(data.meetings.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  if (data.followups.length > 0) {
    sections.push("🔄 *מעקבים פתוחים:*");
    sections.push(data.followups.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  if (data.newContacts.length > 0) {
    sections.push("👥 *שיחות היום:*");
    sections.push(data.newContacts.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  if (data.recentActivity.length > 0) {
    sections.push("📜 *פעולות אחרונות:*");
    sections.push(data.recentActivity.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  if (data.insights.length > 0) {
    sections.push("💡 *שים לב:*");
    sections.push(data.insights.map((i) => `  • ${i}`).join("\n"));
    sections.push("");
  }

  // If nothing to report
  if (data.urgent.length === 0 && data.meetings.length === 0 && data.followups.length === 0 && data.newContacts.length === 0) {
    sections.push("✨ הכל שקט! אין דברים דחופים או ממתינים.\n");
  }

  // Summary line
  sections.push(`סה"כ: ${stats.totalConversations} שיחות, ${stats.openFollowups} משימות פתוחות, ${stats.calendarEvents} פגישות היום`);

  return sections.join("\n");
}
