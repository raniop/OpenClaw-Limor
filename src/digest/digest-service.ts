/**
 * Daily executive digest generator.
 * Collects data from all stores and produces a structured Hebrew summary.
 */
import { approvalStore, conversationStore } from "../stores";
import { getPendingMeetingCount, getPendingMeetings } from "../meetings";
import { listPending as listPendingCapabilities } from "../capabilities/spec-store";
import { getPendingFollowups, getDueFollowups } from "../followups";
import { getRecentActivity } from "../audit/audit-log";
import { getRecentContacts } from "../contacts";
import { listEvents } from "../calendar";
import type { DigestData } from "./digest-types";
import { saveDigest } from "./digest-history";

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

  // --- Urgent: overdue followups ---
  const overdueFollowups = getDueFollowups();
  for (const fu of overdueFollowups) {
    data.urgent.push(`מעקב: ${fu.reason} (${fu.contactName})`);
  }

  // --- Pending approvals ---
  const pendingCount = approvalStore.getPendingCount();
  if (pendingCount > 0) {
    data.urgent.push(`${pendingCount} אנשי קשר ממתינים לאישור`);
  }

  // --- Pending meetings (from state machine) ---
  const pendingMeetingsList = getPendingMeetings();
  const meetingCount = pendingMeetingsList.length;
  if (meetingCount > 0) {
    for (const m of pendingMeetingsList) {
      data.meetings.push(`${m.contactName}: ${m.topic} (${m.id}) [${m.state}]`);
    }
    data.urgent.push(`${meetingCount} בקשות פגישה ממתינות`);
  }

  // --- Pending capabilities ---
  const pendingCaps = listPendingCapabilities();
  for (const cap of pendingCaps) {
    data.capabilities.push(`${cap.title} (${cap.id})`);
    data.waiting.push(`יכולת: ${cap.title}`);
  }

  // --- Pending followups (not yet overdue) ---
  const pendingFollowups = getPendingFollowups();
  for (const fu of pendingFollowups) {
    const dueDate = new Date(fu.dueAt);
    const dueStr = dueDate.toLocaleDateString("he-IL") + " " + dueDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    data.followups.push(`${fu.contactName}: ${fu.reason} (עד ${dueStr})`);
    if (!overdueFollowups.find((o) => o.id === fu.id)) {
      data.waiting.push(`מעקב: ${fu.reason} (${fu.contactName})`);
    }
  }

  // --- Calendar: today + tomorrow ---
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

  // --- Recent contacts (last 24h activity) ---
  const recentContacts = getRecentContacts(10);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newToday = recentContacts.filter((c) => new Date(c.lastSeen) > oneDayAgo);
  for (const c of newToday.slice(0, 5)) {
    data.newContacts.push(c.name);
  }

  // --- Recent activity from audit log (skip internal/capability noise) ---
  const recentAudit = getRecentActivity(10);
  for (const entry of recentAudit.slice(-5)) {
    // Skip internal capability actions — not useful in digest
    if (entry.action.startsWith("capability_")) continue;
    if (entry.action === "daily_digest_sent") continue;
    if (entry.action === "daily_summaries_generated") continue;
    const time = new Date(entry.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    data.recentActivity.push(`${time} - ${entry.action}: ${entry.target} (${entry.result})`);
  }

  // --- Insights ---
  if (overdueFollowups.length > 0) {
    data.insights.push(`יש ${overdueFollowups.length} מעקבים שעבר הזמן שלהם — כדאי לטפל`);
  }
  if (pendingCount > 0 && meetingCount > 0) {
    data.insights.push("יש גם אישורים וגם פגישות ממתינים — כדאי לפנות זמן היום");
  }

  // --- Build digest text ---
  const digestText = formatDigest(data);

  // Save to history for dashboard
  saveDigest(digestText, {
    urgentCount: data.urgent.length,
    waitingCount: data.waiting.length,
    meetingsCount: data.meetings.length,
    followupsCount: data.followups.length,
  });

  return digestText;
}

function formatDigest(data: DigestData): string {
  const sections: string[] = [];

  sections.push("📊 *תקציר יומי*\n");

  if (data.urgent.length > 0) {
    sections.push("🔥 *דחוף:*");
    sections.push(data.urgent.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.waiting.length > 0) {
    sections.push("⏳ *ממתין:*");
    sections.push(data.waiting.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.newContacts.length > 0) {
    sections.push("👥 *פניות אחרונות:*");
    sections.push(data.newContacts.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.meetings.length > 0) {
    sections.push("📅 *פגישות:*");
    sections.push(data.meetings.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.calendar.length > 0) {
    sections.push("🗓️ *יומן:*");
    sections.push(data.calendar.join("\n"));
    sections.push("");
  }

  if (data.capabilities.length > 0) {
    sections.push("🧠 *יכולות חדשות:*");
    sections.push(data.capabilities.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.followups.length > 0) {
    sections.push("🔄 *מעקבים:*");
    sections.push(data.followups.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.recentActivity.length > 0) {
    sections.push("📜 *פעילות אחרונה:*");
    sections.push(data.recentActivity.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  if (data.insights.length > 0) {
    sections.push("💡 *כדאי לשים לב:*");
    sections.push(data.insights.map((i) => `  - ${i}`).join("\n"));
    sections.push("");
  }

  // If nothing to report
  if (data.urgent.length === 0 && data.waiting.length === 0 && data.meetings.length === 0 && data.newContacts.length === 0) {
    sections.push("✨ הכל שקט! אין דברים דחופים או ממתינים.");
  }

  return sections.join("\n");
}
