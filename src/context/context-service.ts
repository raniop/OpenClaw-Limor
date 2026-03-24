/**
 * Context service v3 — high-level API for building and formatting context.
 * Includes resolved context with primary focus and response mode.
 */
import { config } from "../config";
import type { ContextBundle, ResolvedContext, DebugTrace } from "./context-types";
import { buildContext, buildResolvedContext } from "./context-builder";

export function getContextBundle(
  chatId: string,
  message: string,
  sender: { name: string; isOwner: boolean; isGroup: boolean }
): ContextBundle {
  return buildContext({ chatId, message, sender });
}

export function getResolvedContext(
  chatId: string,
  message: string,
  sender: { name: string; isOwner: boolean; isGroup: boolean }
): ResolvedContext {
  return buildResolvedContext({ chatId, message, sender });
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

const TONE_LABELS: Record<string, string> = {
  friendly: "חברותי",
  direct: "ישיר",
  professional: "מקצועי",
  warm: "חם",
};

const BREVITY_LABELS: Record<string, string> = {
  short: "קצר",
  medium: "בינוני",
};

const STRUCTURE_LABELS: Record<string, string> = {
  direct_answer: "תשובה ישירה",
  status_list: "רשימת סטטוס",
  action_confirmation: "אישור פעולה",
  clarify_and_act: "הבהרה ופעולה",
};

/**
 * Format a ContextBundle into concise Hebrew text for injection into the system prompt.
 * Backward-compatible — still works with plain ContextBundle.
 */
export function formatContextForPrompt(bundle: ContextBundle): string {
  return formatBundleSection(bundle);
}

/**
 * Format a ResolvedContext into concise Hebrew text with focus + response mode sections.
 */
export function formatResolvedContextForPrompt(resolved: ResolvedContext): string {
  const lines: string[] = [];

  // Base context bundle section
  lines.push(formatBundleSection(resolved.bundle));

  // Primary focus section
  lines.push("");
  lines.push(`🎯 פוקוס עיקרי:`);
  lines.push(`  - ${resolved.primaryFocus.summary}`);
  if (resolved.primaryFocus.reason !== resolved.primaryFocus.summary) {
    lines.push(`  - סיבה: ${resolved.primaryFocus.reason}`);
  }

  // Response mode section
  lines.push("");
  lines.push(`🧭 איך לענות:`);
  lines.push(`  - טון: ${TONE_LABELS[resolved.responseMode.tone] || resolved.responseMode.tone}`);
  lines.push(`  - אורך: ${BREVITY_LABELS[resolved.responseMode.brevity] || resolved.responseMode.brevity}`);
  lines.push(`  - מבנה: ${STRUCTURE_LABELS[resolved.responseMode.structure] || resolved.responseMode.structure}`);
  lines.push(`  - להזכיר דברים פתוחים: ${resolved.responseMode.shouldMentionOpenLoops ? "כן" : "לא"}`);
  lines.push(`  - להתייחס לעיכוב: ${resolved.responseMode.shouldAcknowledgeDelay ? "כן" : "לא"}`);

  // References section (only if references found)
  if (resolved.bundle.references.length > 0) {
    lines.push("");
    lines.push(`🔎 למה כנראה מתייחסים:`);
    for (const ref of resolved.bundle.references.slice(0, 2)) {
      const label = ref.kind === "followup" ? `followup: ${ref.displayName}` : ref.displayName;
      lines.push(`  - ${label}`);
    }
  }

  // Missing info section (only when something is missing)
  if (!resolved.bundle.missingInfo.missing.includes("none")) {
    lines.push("");
    lines.push(`🧩 מה חסר:`);
    lines.push(`  - ${resolved.bundle.missingInfo.summary}`);
  }

  // Action plan section
  lines.push("");
  lines.push(`✅ פעולה מועדפת:`);
  lines.push(`  - ${resolved.actionPlan.summary}`);
  if (resolved.actionPlan.reason !== resolved.actionPlan.summary) {
    lines.push(`  - סיבה: ${resolved.actionPlan.reason}`);
  }
  lines.push(`  - נדרש הבהרה: ${resolved.actionPlan.needsClarification ? "כן" : "לא"}`);

  // Tool intent section
  if (resolved.toolIntent.type !== "none") {
    lines.push("");
    lines.push(`🛠️ כלי כנראה נדרש:`);
    lines.push(`  - ${resolved.toolIntent.type} — ${resolved.toolIntent.summary}`);
    if (!resolved.toolIntent.shouldUseTool) {
      lines.push(`  - ⚠️ ממתין להבהרה לפני הפעלת כלי`);
    }
  }

  // Memory commit section (only when action != skip)
  if (resolved.memoryCommitDecision.action !== "skip") {
    lines.push("");
    lines.push(`🧠 החלטת זיכרון:`);
    lines.push(`  - ${resolved.memoryCommitDecision.summary}`);
    if (resolved.memoryCommitDecision.reason !== resolved.memoryCommitDecision.summary) {
      lines.push(`  - סיבה: ${resolved.memoryCommitDecision.reason}`);
    }
  }

  // Conversation state section
  lines.push("");
  lines.push(`🧭 מצב שיחה:`);
  lines.push(`  - ${resolved.conversationState.summary}`);
  if (resolved.conversationState.reason !== resolved.conversationState.summary) {
    lines.push(`  - סיבה: ${resolved.conversationState.reason}`);
  }

  // Contradictions section (only when contradictions exist)
  if (resolved.contradictions.length > 0) {
    lines.push("");
    lines.push(`⚠️ נקודות זהירות:`);
    for (const c of resolved.contradictions.slice(0, 2)) {
      lines.push(`  - ${c.summary}`);
      lines.push(`  - → ${c.resolution}`);
    }
  }

  // Response strategy section
  lines.push("");
  lines.push(`🎬 אסטרטגיית תגובה:`);
  lines.push(`  - ${resolved.responseStrategy.summary}`);
  if (resolved.responseStrategy.reason !== resolved.responseStrategy.summary) {
    lines.push(`  - סיבה: ${resolved.responseStrategy.reason}`);
  }

  // Execution decision section
  lines.push("");
  lines.push(`🚦 החלטת ביצוע:`);
  lines.push(`  - ${resolved.executionDecision.summary}`);
  if (resolved.executionDecision.reason !== resolved.executionDecision.summary) {
    lines.push(`  - סיבה: ${resolved.executionDecision.reason}`);
  }
  lines.push(`  - כלים מותרים: ${resolved.executionDecision.allowTools ? "כן" : "לא"}`);

  // Tool routing policy section
  lines.push("");
  lines.push(`🧰 ניתוב כלים:`);
  lines.push(`  - ${resolved.toolRoutingPolicy.summary}`);
  if (resolved.toolRoutingPolicy.reason !== resolved.toolRoutingPolicy.summary) {
    lines.push(`  - סיבה: ${resolved.toolRoutingPolicy.reason}`);
  }
  const toolNames = resolved.toolRoutingPolicy.allowedToolNames;
  lines.push(`  - כלים חשופים: ${toolNames.length > 0 ? toolNames.join(", ") : "אין"}`);

  // Outcome evaluation section
  const outcome = resolved.outcomeEvaluation;
  if (outcome.requiresFollowup || (outcome.status !== "completed" && outcome.status !== "unknown")) {
    lines.push("");
    lines.push(`📊 מצב משימה:`);
    const followupHint = outcome.followupSuggestedMinutes ? ` — כדאי לבדוק בעוד ${outcome.followupSuggestedMinutes} דקות` : "";
    lines.push(`  - ${outcome.summary}${followupHint}`);
  }

  // Domain policy section (only when domain !== "general" or has rules)
  const dp = resolved.domainPolicy;
  if (dp.domain !== "general" || dp.rules.length > 0) {
    lines.push("");
    lines.push(`🧩 מדיניות דומיין:`);
    lines.push(`  - ${dp.summary}`);
    lines.push(`  - סיבה: ${dp.reason}`);
    for (const rule of dp.rules.slice(0, 3)) {
      lines.push(`  - ${rule}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a ResolvedContext using compressed prompt — preferred for WhatsApp flow.
 * Only includes prioritized sections, compact and prompt-friendly.
 */
export function formatCompressedContextForPrompt(resolved: ResolvedContext): string {
  const { compressedPrompt } = resolved;
  const lines: string[] = [];

  lines.push("📌 הקשר דחוס:");

  const included = compressedPrompt.sections.filter((s) => s.included);
  for (const section of included) {
    if (section.content.length === 0) continue;
    lines.push(`${section.title}:`);
    for (const line of section.content) {
      lines.push(`  - ${line}`);
    }
  }

  // Outcome evaluation section (only when followup needed or not completed)
  const outcome = resolved.outcomeEvaluation;
  if (outcome.requiresFollowup || (outcome.status !== "completed" && outcome.status !== "unknown")) {
    lines.push(`📊 מצב משימה:`);
    const followupHint = outcome.followupSuggestedMinutes ? ` — כדאי לבדוק בעוד ${outcome.followupSuggestedMinutes} דקות` : "";
    lines.push(`  - ${outcome.summary}${followupHint}`);
  }

  // Domain policy section (only for non-general domains)
  const dp = resolved.domainPolicy;
  if (dp.domain !== "general") {
    lines.push(`🧩 מדיניות דומיין:`);
    lines.push(`  - ${dp.summary}`);
    lines.push(`  - סיבה: ${dp.reason}`);
    for (const rule of dp.rules.slice(0, 2)) {
      lines.push(`  - ${rule}`);
    }
  }

  lines.push("");
  lines.push(`🧾 תמצית:`);
  lines.push(`  - ${compressedPrompt.summary}`);

  return lines.join("\n");
}

/**
 * Internal: format the ContextBundle section (shared between both formatters).
 */
function formatBundleSection(bundle: ContextBundle): string {
  const lines: string[] = [];

  lines.push("📌 הקשר נוכחי:");

  // --- Person ---
  if (bundle.person.isOwner) {
    lines.push(`  • ${config.ownerName} (הבעלים)`);
  } else if (bundle.person.isGroup) {
    lines.push(`  • שיחה בקבוצה`);
  } else {
    const type = TYPE_LABELS[bundle.person.relationshipType] || bundle.person.relationshipType;
    lines.push(`  • ${bundle.person.name} — ${type} (${bundle.person.importanceScore}/100)`);
    if (bundle.person.communicationStyle !== "unknown") {
      lines.push(`  • סגנון: ${STYLE_LABELS[bundle.person.communicationStyle]}`);
    }
  }

  // --- Urgency ---
  if (bundle.urgency.hasFollowup || bundle.urgency.priority !== "low") {
    lines.push(`  • עדיפות: ${PRIORITY_LABELS[bundle.urgency.priority]}`);
  }

  // --- Open Loops (actual content) ---
  if (bundle.openLoops.followups.length > 0) {
    lines.push("  📋 דברים פתוחים:");
    for (const fu of bundle.openLoops.followups.slice(0, 3)) {
      const overdueTag = fu.isOverdue ? " ⚠️ עבר הזמן!" : "";
      const from = fu.requesterName ? ` (מ-${fu.requesterName})` : "";
      lines.push(`    - ${fu.reason}${from}${overdueTag}`);
    }
  }
  if (bundle.openLoops.pendingMeeting) {
    const m = bundle.openLoops.pendingMeeting;
    lines.push(`  📅 פגישה ממתינה: ${m.requesterName} — ${m.topic} (${m.id})`);
  }

  // --- Conversation state ---
  if (bundle.conversation.repeatedRecentMessages) {
    lines.push(`  • ⚠️ כמה הודעות בלי מענה`);
  }
  if (bundle.urgency.waitingTimeMinutes > 60) {
    const hours = Math.round(bundle.urgency.waitingTimeMinutes / 60);
    lines.push(`  • מחכה כבר ${hours} שעות`);
  }

  // --- System overview (owner only) ---
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

  // --- Response Guidance (directives for AI) ---
  if (bundle.responseGuidance.length > 0) {
    lines.push("  🎯 הנחיות:");
    for (const g of bundle.responseGuidance) {
      lines.push(`    - ${g}`);
    }
  }

  // --- Summary ---
  lines.push(`  • סיכום: ${bundle.historySummary}`);

  return lines.join("\n");
}

/**
 * Format a DebugTrace into a compact readable block for logging.
 */
export function formatDebugTrace(resolved: ResolvedContext): string {
  const { debugTrace } = resolved;
  const lines: string[] = [];

  lines.push("🧠 Debug Trace:");
  for (const item of debugTrace.items) {
    lines.push(`  - [${item.step}] ${item.summary}`);
  }
  lines.push(`🧾 Summary:`);
  lines.push(`  - ${debugTrace.summary}`);

  return lines.join("\n");
}
