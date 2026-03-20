/**
 * Prompt Compressor — deterministic priority-based prompt packing.
 * Decides which context sections to include and produces compact output.
 * Max 8 sections, min 4, priority-ordered.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, CompressedPrompt, PromptSection, PromptPriorityLevel } from "./context-types";

type CompressorInput = Omit<ResolvedContext, "compressedPrompt" | "outcomeEvaluation" | "debugTrace" | "followupAutomationDecision" | "domainPolicy">;

const PRIORITY_ORDER: PromptPriorityLevel[] = ["critical", "high", "medium", "low"];
const MAX_SECTIONS = 8;
const MIN_SECTIONS = 4;

const MOOD_LABELS: Record<string, string> = { neutral: "ניטרלי", stressed: "לחוץ", frustrated: "מתוסכל", happy: "שמח", sad: "עצוב", rushed: "ממהר", excited: "נרגש" };
const PRIORITY_LABELS: Record<string, string> = { low: "נמוכה", medium: "בינונית", high: "גבוהה" };
const TYPE_LABELS: Record<string, string> = { unknown: "לא מוגדר", client: "לקוח", lead: "ליד", friend: "חבר/ה", family: "משפחה", work: "עבודה", service: "שירות" };
const TONE_LABELS: Record<string, string> = { friendly: "חברותי", direct: "ישיר", professional: "מקצועי", warm: "חם" };
const REGISTER_LABELS: Record<string, string> = { casual: "יומיומי", professional: "מקצועי", relaxed: "רגוע" };
const STRUCTURE_LABELS: Record<string, string> = { direct_answer: "תשובה ישירה", status_list: "רשימת סטטוס", action_confirmation: "אישור פעולה", clarify_and_act: "הבהרה ופעולה" };

/**
 * Build a compressed prompt by selecting and formatting only the most important sections.
 */
export function buildCompressedPrompt(resolved: CompressorInput): CompressedPrompt {
  const sections = buildAllSections(resolved);

  // Sort by priority order
  sections.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  // Include sections up to MAX
  let included = 0;
  for (const section of sections) {
    if (section.included && included < MAX_SECTIONS) {
      included++;
    } else {
      section.included = false;
      section.reason = section.included ? "חריגה ממגבלת סעיפים" : section.reason;
    }
  }

  // Ensure minimum sections
  if (included < MIN_SECTIONS) {
    const backfillOrder: PromptSection["key"][] = ["person", "conversation_state", "urgency", "action_plan"];
    for (const key of backfillOrder) {
      if (included >= MIN_SECTIONS) break;
      const section = sections.find((s) => s.key === key && !s.included);
      if (section) {
        section.included = true;
        section.reason = "השלמה למינימום סעיפים";
        included++;
      }
    }
  }

  const summary = buildSummary(resolved, sections);
  return { sections, summary };
}

function buildAllSections(r: CompressorInput): PromptSection[] {
  const { bundle, primaryFocus, responseMode, actionPlan, toolIntent, memoryWriteDecision, conversationState, contradictions, responseStrategy, executionDecision, toolRoutingPolicy } = r;
  const sections: PromptSection[] = [];

  // --- CRITICAL: always included ---
  sections.push({
    key: "primary_focus",
    title: "🎯 פוקוס",
    content: [primaryFocus.summary, ...(primaryFocus.reason !== primaryFocus.summary ? [`סיבה: ${primaryFocus.reason}`] : [])],
    priority: "critical",
    included: true,
    reason: "תמיד נכלל",
  });

  sections.push({
    key: "response_strategy",
    title: "🎬 אסטרטגיה",
    content: [responseStrategy.summary],
    priority: "critical",
    included: true,
    reason: "תמיד נכלל",
  });

  sections.push({
    key: "execution_decision",
    title: "🚦 ביצוע",
    content: [`${executionDecision.summary} | כלים: ${executionDecision.allowTools ? "כן" : "לא"}`],
    priority: "critical",
    included: true,
    reason: "תמיד נכלל",
  });

  // --- CRITICAL conditional ---
  const hasMissing = !bundle.missingInfo.missing.includes("none");
  sections.push({
    key: "missing_info",
    title: "🧩 חסר",
    content: hasMissing ? [bundle.missingInfo.summary] : [],
    priority: hasMissing ? "critical" : "low",
    included: hasMissing,
    reason: hasMissing ? "חסר מידע קריטי" : "לא חסר מידע",
  });

  const hasContradictions = contradictions.length > 0;
  sections.push({
    key: "contradictions",
    title: "⚠️ זהירות",
    content: hasContradictions ? contradictions.slice(0, 2).map((c) => `${c.summary} → ${c.resolution}`) : [],
    priority: hasContradictions ? "critical" : "low",
    included: hasContradictions,
    reason: hasContradictions ? "יש סתירות שצריך להתייחס אליהן" : "אין סתירות",
  });

  // --- HIGH ---
  const hasToolRouting = executionDecision.allowTools || toolIntent.shouldUseTool;
  sections.push({
    key: "tool_routing",
    title: "🧰 ניתוב",
    content: hasToolRouting && toolRoutingPolicy.allowedToolNames.length > 0
      ? [`${toolRoutingPolicy.group}: ${toolRoutingPolicy.allowedToolNames.slice(0, 5).join(", ")}`]
      : toolRoutingPolicy.group !== "none" ? [toolRoutingPolicy.summary] : [],
    priority: hasToolRouting ? "high" : "low",
    included: hasToolRouting && toolRoutingPolicy.group !== "none",
    reason: hasToolRouting ? "כלים רלוונטיים לתור הזה" : "אין כלים",
  });

  const hasActionPlan = actionPlan.type !== "reply_only";
  sections.push({
    key: "action_plan",
    title: "✅ פעולה",
    content: [actionPlan.summary, ...(actionPlan.needsClarification ? ["נדרש הבהרה"] : [])],
    priority: hasActionPlan ? "high" : "medium",
    included: hasActionPlan,
    reason: hasActionPlan ? "יש פעולה מתוכננת" : "תשובה ישירה בלבד",
  });

  const hasOpenLoops = bundle.openLoops.followups.length > 0 || !!bundle.openLoops.pendingMeeting;
  const openLoopContent: string[] = [];
  for (const fu of bundle.openLoops.followups.slice(0, 2)) {
    const tag = fu.isOverdue ? " ⚠️" : "";
    const from = fu.requesterName ? ` (${fu.requesterName})` : "";
    openLoopContent.push(`${fu.reason.substring(0, 80)}${from}${tag}`);
  }
  if (bundle.openLoops.pendingMeeting) {
    const m = bundle.openLoops.pendingMeeting;
    openLoopContent.push(`פגישה: ${m.requesterName} — ${m.topic}`);
  }
  sections.push({
    key: "open_loops",
    title: "📋 פתוח",
    content: openLoopContent,
    priority: hasOpenLoops ? "high" : "low",
    included: hasOpenLoops,
    reason: hasOpenLoops ? "יש דברים פתוחים" : "אין דברים פתוחים",
  });

  const hasRefs = bundle.references.length > 0;
  sections.push({
    key: "references",
    title: "🔎 ייחוסים",
    content: hasRefs ? bundle.references.slice(0, 2).map((ref) => ref.kind === "followup" ? `followup: ${ref.displayName}` : ref.displayName) : [],
    priority: hasRefs ? "high" : "low",
    included: hasRefs,
    reason: hasRefs ? "יש ייחוסים" : "אין ייחוסים",
  });

  const urgencyRelevant = bundle.urgency.priority !== "low" || bundle.urgency.isOverdue || bundle.urgency.waitingTimeMinutes > 60;
  const urgencyContent: string[] = [];
  if (urgencyRelevant) {
    urgencyContent.push(`עדיפות: ${PRIORITY_LABELS[bundle.urgency.priority]}`);
    if (bundle.urgency.waitingTimeMinutes > 60) {
      urgencyContent.push(`מחכה ${Math.round(bundle.urgency.waitingTimeMinutes / 60)} שעות`);
    }
  }
  sections.push({
    key: "urgency",
    title: "⏱️ דחיפות",
    content: urgencyContent,
    priority: urgencyRelevant ? "high" : "medium",
    included: urgencyRelevant,
    reason: urgencyRelevant ? "יש דחיפות" : "אין דחיפות מיוחדת",
  });

  // conversation_state always HIGH
  sections.push({
    key: "conversation_state",
    title: "🧭 מצב שיחה",
    content: [conversationState.summary],
    priority: "high",
    included: true,
    reason: "תמיד נכלל",
  });

  // --- MEDIUM ---
  const personImportant = bundle.person.isOwner || bundle.person.importanceScore >= 70 || bundle.person.relationshipType !== "unknown";
  const personContent: string[] = [];
  if (bundle.person.isOwner) {
    personContent.push("רני (הבעלים)");
  } else if (bundle.person.isGroup) {
    personContent.push("קבוצה");
  } else {
    const type = TYPE_LABELS[bundle.person.relationshipType] || bundle.person.relationshipType;
    personContent.push(`${bundle.person.name} — ${type} (${bundle.person.importanceScore}/100)`);
  }
  sections.push({
    key: "person",
    title: "👤 אדם",
    content: personContent,
    priority: personImportant ? "high" : "medium",
    included: personImportant,
    reason: personImportant ? "אדם חשוב או מוכר" : "אדם רגיל",
  });

  const modeRelevant = responseMode.tone !== "professional" || responseMode.brevity !== "medium" || responseMode.structure !== "direct_answer" || responseMode.register !== "professional";
  const registerLabel = REGISTER_LABELS[responseMode.register] || responseMode.register;
  sections.push({
    key: "response_mode",
    title: "🗣️ אופן תגובה",
    content: modeRelevant ? [`טון: ${TONE_LABELS[responseMode.tone] || responseMode.tone}, מבנה: ${STRUCTURE_LABELS[responseMode.structure] || responseMode.structure}, רגיסטר: ${registerLabel}`] : [],
    priority: modeRelevant ? "medium" : "low",
    included: modeRelevant,
    reason: modeRelevant ? "אופן תגובה שונה מברירת מחדל" : "אופן תגובה רגיל",
  });

  const hasToolIntent = toolIntent.type !== "none";
  sections.push({
    key: "tool_intent",
    title: "🛠️ כוונת כלי",
    content: hasToolIntent ? [`${toolIntent.type}: ${toolIntent.summary}`] : [],
    priority: hasToolIntent ? "medium" : "low",
    included: hasToolIntent,
    reason: hasToolIntent ? "יש כוונת כלי" : "אין כוונת כלי",
  });

  const memoryCommit = r.memoryCommitDecision;
  const shouldShowMemory = memoryCommit.action !== "skip";
  sections.push({
    key: "memory_write",
    title: "🧠 זיכרון",
    content: shouldShowMemory ? [memoryCommit.summary] : [],
    priority: shouldShowMemory ? (memoryCommit.action === "reject_conflict" ? "high" : "medium") : "low",
    included: shouldShowMemory,
    reason: shouldShowMemory ? memoryCommit.reason : "אין מה לשמור",
  });

  const hasGuidance = bundle.responseGuidance.length > 0;
  sections.push({
    key: "guidance",
    title: "🎯 הנחיות",
    content: hasGuidance ? bundle.responseGuidance.slice(0, 2) : [],
    priority: hasGuidance ? "medium" : "low",
    included: hasGuidance,
    reason: hasGuidance ? "יש הנחיות ספציפיות" : "אין הנחיות",
  });

  // --- Mood section ---
  const moodRelevant = bundle.mood.mood !== "neutral" && bundle.mood.confidence >= 0.6;
  sections.push({
    key: "mood",
    title: "😊 מצב רוח",
    content: moodRelevant ? [`המשתמש נשמע ${MOOD_LABELS[bundle.mood.mood] || bundle.mood.mood}`] : [],
    priority: moodRelevant ? "medium" : "low",
    included: moodRelevant,
    reason: moodRelevant ? "זוהה מצב רוח שמשפיע על אופן התגובה" : "מצב רוח ניטרלי",
  });

  return sections;
}

function buildSummary(r: CompressorInput, sections: PromptSection[]): string {
  const { primaryFocus, responseStrategy, executionDecision, actionPlan } = r;

  if (actionPlan.needsClarification) {
    return `יש בקשה שאולי חסר בה פרט — אם אפשר לבצע בלי, תבצעי. אם באמת חסר משהו קריטי, שאלי. ⚠️ כלים זמינים — חובה להשתמש בהם לפעולות!`;
  }
  if (executionDecision.allowTools && executionDecision.type === "allow_tool_execution") {
    return `זוהתה בקשה ברורה וניתן להתקדם לביצוע.`;
  }
  if (primaryFocus.type === "followup") {
    return `יש followup פתוח ולכן כדאי להתייחס אליו.`;
  }
  if (primaryFocus.type === "status") {
    return `המשתמש ביקש סטטוס — לתת סיכום מרוכז.`;
  }
  if (primaryFocus.type === "meeting") {
    return `יש בקשת פגישה ממתינה שדורשת התייחסות.`;
  }
  if (responseStrategy.type === "brief_answer") {
    return `יש כמה הודעות בלי מענה — לתת תשובה קצרה וישירה.`;
  }
  return `שיחה רגילה — לתת מענה ישיר. ⚠️ אם צריך לבצע פעולה (שליחה, קביעה, חיפוש) — חובה להשתמש בכלי! אסור לטעון שביצעת פעולה בלי להפעיל tool.`;
}
