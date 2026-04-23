import { getRecentTraces } from "../../ops/operational-trace";
import { computeMetrics } from "../../ops/metrics";
import { getFailureStats } from "../../context/failure-learner";
import { config } from "../../config";
import type { ToolHandler } from "./types";
import { readFileSync } from "fs";
import { resolve } from "path";

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../../package.json"), "utf-8"));
    return pkg.version || "unknown";
  } catch { return "unknown"; }
}

export const selfAwarenessHandlers: Record<string, ToolHandler> = {
  get_my_status: async (input) => {
    const period = input.period || "last_24h";
    const allTraces = getRecentTraces();

    // Filter by period
    const now = Date.now();
    const cutoff =
      period === "last_24h" ? now - 24 * 60 * 60 * 1000 :
      period === "last_7d" ? now - 7 * 24 * 60 * 60 * 1000 : 0;

    const traces = cutoff > 0
      ? allTraces.filter(t => new Date(t.timestamp).getTime() >= cutoff)
      : allTraces;

    if (traces.length === 0) {
      return `📊 אין נתונים לתקופה ${period}. סה"כ traces במערכת: ${allTraces.length}`;
    }

    // Compute metrics
    const report = computeMetrics(traces, period);

    // Build summary
    const lines: string[] = [];
    lines.push(`📊 **סטטוס ${period}** (${report.totalTraces} שיחות)`);
    lines.push(`🔖 גרסה: Limor ${getVersion()} | מודל: ${config.model}`);
    lines.push("");

    // Key metrics
    const metricLabels: Record<string, string> = {
      tool_precision: "🎯 דיוק כלים",
      tool_recall: "📡 כיסוי כלים",
      hallucination_rate: "🚫 שיעור הזיות",
      task_completion_rate: "✅ השלמת משימות",
      false_completion_rate: "⚠️ השלמות כוזבות",
      avg_response_time_ms: "⏱️ זמן תגובה ממוצע",
      self_check_critical_rate: "🔴 התראות קריטיות",
    };

    for (const [key, label] of Object.entries(metricLabels)) {
      const m = report.metrics[key];
      if (!m) continue;
      const icon = m.status === "good" ? "🟢" : m.status === "warning" ? "🟡" : "🔴";
      const value = key.includes("rate") || key.includes("precision") || key.includes("recall")
        ? (m.value * 100).toFixed(1) + "%"
        : key.includes("time") ? Math.round(m.value) + "ms" : m.value.toFixed(2);
      lines.push(`${icon} ${label}: ${value}`);
    }

    // Top failures
    if (report.topFailures.length > 0) {
      lines.push("");
      lines.push("**בעיות נפוצות:** " + report.topFailures.slice(0, 3).join(", "));
    }

    // Tool failure stats from failure-learner
    const failStats = getFailureStats();
    const failEntries = Object.entries(failStats).sort((a, b) => b[1] - a[1]);
    if (failEntries.length > 0) {
      lines.push("");
      lines.push("**כלים שנכשלים (7 ימים):** " + failEntries.slice(0, 5).map(([k, v]) => `${k}(${v})`).join(", "));
    }

    // What I know / don't know
    lines.push("");
    lines.push("**מה אני יודעת:** " + [
      traces.some(t => t.toolsUsed.includes("list_events")) ? "יומן" : null,
      traces.some(t => t.toolsUsed.includes("web_search")) ? "חיפוש" : null,
      traces.some(t => t.toolsUsed.includes("delegate_to_agent")) ? "סוכנים" : null,
      traces.some(t => t.toolsUsed.includes("crm_search_policy")) ? "CRM" : null,
      traces.some(t => t.toolsUsed.includes("send_message")) ? "הודעות" : null,
    ].filter(Boolean).join(", ") || "אין שימוש בכלים עדיין");

    return lines.join("\n");
  },
};
