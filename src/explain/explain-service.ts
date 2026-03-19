/**
 * Explain service — provides human-readable explanations of system decisions.
 * Used when owner asks "why did you do that?" or "what do you know about X?"
 */
import { getRecentDecisions, getDecisionsByTarget, getDecisionsByCategory } from "./decision-store";
import type { DecisionCategory } from "./explain-types";

/**
 * Explain the most recent decisions, optionally filtered.
 */
export function explainRecentActions(limit: number = 5): string {
  const decisions = getRecentDecisions(limit);
  if (decisions.length === 0) {
    return "אין פעולות אחרונות לדווח עליהן.";
  }

  const lines = decisions.map((d) => {
    const time = new Date(d.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const rules = d.rulesApplied.length > 0 ? `\n    כללים: ${d.rulesApplied.join(", ")}` : "";
    const tools = d.toolsUsed.length > 0 ? `\n    כלים: ${d.toolsUsed.join(", ")}` : "";
    const confidence = d.confidence ? ` (ביטחון: ${Math.round(d.confidence * 100)}%)` : "";
    return `  ${time} | ${d.summary}${confidence}\n    תוצאה: ${d.outcome}${rules}${tools}`;
  });

  return `🔍 *פעולות אחרונות:*\n\n${lines.join("\n\n")}`;
}

/**
 * Explain decisions related to a specific contact/target.
 */
export function explainAboutTarget(target: string): string {
  const decisions = getDecisionsByTarget(target, 10);
  if (decisions.length === 0) {
    return `אין מידע מוסבר על "${target}".`;
  }

  const lines = decisions.map((d) => {
    const date = new Date(d.timestamp).toLocaleDateString("he-IL");
    return `  ${date} | ${d.summary} → ${d.outcome}`;
  });

  return `🔍 *החלטות לגבי ${target}:*\n\n${lines.join("\n")}`;
}

/**
 * Explain decisions by category.
 */
export function explainByCategory(category: DecisionCategory, limit: number = 5): string {
  const CATEGORY_NAMES: Record<DecisionCategory, string> = {
    approval: "אישורים",
    meeting: "פגישות",
    tool: "כלים",
    group: "קבוצות",
    digest: "תקצירים",
    capability: "יכולות",
    followup: "מעקבים",
    memory: "זיכרון",
  };

  const decisions = getDecisionsByCategory(category, limit);
  if (decisions.length === 0) {
    return `אין החלטות מסוג "${CATEGORY_NAMES[category]}".`;
  }

  const lines = decisions.map((d) => {
    const time = new Date(d.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    return `  ${time} | ${d.summary} → ${d.outcome}`;
  });

  return `🔍 *${CATEGORY_NAMES[category]}:*\n\n${lines.join("\n")}`;
}

/**
 * Get a current system status summary.
 */
export function getSystemStatus(): string {
  const recent = getRecentDecisions(50);
  const last24h = recent.filter(
    (d) => new Date(d.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );

  const categoryCounts: Record<string, number> = {};
  for (const d of last24h) {
    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
  }

  const CATEGORY_NAMES: Record<string, string> = {
    approval: "אישורים",
    meeting: "פגישות",
    tool: "כלים",
    group: "קבוצות",
    digest: "תקצירים",
    capability: "יכולות",
    followup: "מעקבים",
    memory: "זיכרון",
  };

  const breakdown = Object.entries(categoryCounts)
    .map(([cat, count]) => `  - ${CATEGORY_NAMES[cat] || cat}: ${count}`)
    .join("\n");

  return `📊 *סטטוס מערכת (24 שעות אחרונות):*\n\nסה"כ פעולות: ${last24h.length}\n${breakdown || "  אין פעילות"}`;
}
