/**
 * Context service — high-level API for building and formatting context.
 */
import type { ContextBundle } from "./context-types";
import { buildContext } from "./context-builder";

export function getContextBundle(
  chatId: string,
  message: string,
  sender: { name: string; isOwner: boolean; isGroup: boolean }
): ContextBundle {
  return buildContext({ chatId, message, sender });
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
};

const TYPE_LABELS: Record<string, string> = {
  unknown: "לא מוגדר",
  client: "לקוח",
  lead: "ליד",
  friend: "חבר/ה",
  family: "משפחה",
  work: "עבודה",
  service: "שירות",
};

const STYLE_LABELS: Record<string, string> = {
  unknown: "לא מוגדר",
  formal: "פורמלי",
  friendly: "חברותי",
  brief: "תמציתי",
  warm: "חם",
};

/**
 * Format a ContextBundle into concise Hebrew text for injection into the system prompt.
 */
export function formatContextForPrompt(bundle: ContextBundle): string {
  const lines: string[] = [];

  lines.push("📌 הקשר נוכחי:");

  // Person
  if (bundle.person.isOwner) {
    lines.push(`  • רני (הבעלים)`);
  } else if (bundle.person.isGroup) {
    lines.push(`  • שיחה בקבוצה`);
  } else {
    const type = TYPE_LABELS[bundle.person.relationshipType] || bundle.person.relationshipType;
    lines.push(`  • ${bundle.person.name} — ${type} (${bundle.person.importanceScore}/100)`);
    if (bundle.person.communicationStyle !== "unknown") {
      lines.push(`  • סגנון: ${STYLE_LABELS[bundle.person.communicationStyle]}`);
    }
  }

  // Urgency
  if (bundle.urgency.hasFollowup || bundle.urgency.priority !== "low") {
    lines.push(`  • עדיפות: ${PRIORITY_LABELS[bundle.urgency.priority]}`);
  }
  if (bundle.urgency.isOverdue) {
    lines.push(`  • ⚠️ יש followup שעבר הזמן שלו!`);
  } else if (bundle.urgency.hasFollowup) {
    lines.push(`  • יש followup פתוח`);
  }

  // Conversation state
  if (bundle.conversation.repeatedRecentMessages) {
    lines.push(`  • ⚠️ המשתמש שלח מספר הודעות בלי מענה — חשוב לענות ממוקד`);
  }
  if (bundle.urgency.waitingTimeMinutes > 60) {
    const hours = Math.round(bundle.urgency.waitingTimeMinutes / 60);
    lines.push(`  • מחכה כבר ${hours} שעות`);
  }

  // System overview (only for owner)
  if (bundle.person.isOwner) {
    const sys = bundle.system;
    const pending: string[] = [];
    if (sys.pendingApprovals > 0) pending.push(`${sys.pendingApprovals} אישורים`);
    if (sys.pendingMeetings > 0) pending.push(`${sys.pendingMeetings} פגישות`);
    if (sys.pendingFollowups > 0) pending.push(`${sys.pendingFollowups} מעקבים`);
    if (pending.length > 0) {
      lines.push(`  • ממתין: ${pending.join(", ")}`);
    }
  }

  // Summary
  lines.push(`  • סיכום: ${bundle.historySummary}`);

  return lines.join("\n");
}
