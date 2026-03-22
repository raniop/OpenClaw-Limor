/**
 * Metrics Collector — חישוב מטריקות תפעוליות מתוך operational traces.
 * כל הלוגיקה דטרמיניסטית — ללא קריאות AI.
 */
import type { OperationalTrace } from "./operational-trace";
import type { SelfCheckFlag } from "./self-check";

// ── Types ────────────────────────────────────────────────────────────

export interface MetricDefinition {
  name: string;
  description: string; // Hebrew
  compute: (traces: OperationalTrace[]) => number;
  goodThreshold: number;   // Above this = good (or below for inverted metrics)
  failThreshold: number;   // Below this = fail (or above for inverted metrics)
  requiredFields: string[];
  /** When true, lower values are better (e.g. error rates). */
  invertedScale?: boolean;
}

export interface MetricResult {
  value: number;
  status: "good" | "warning" | "fail";
}

export interface MetricsReport {
  period: string; // "last_24h", "last_7d", "all"
  totalTraces: number;
  metrics: Record<string, MetricResult>;
  topFailures: string[]; // Most common self-check flags
  generatedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1; // no data = assume good
  return numerator / denominator;
}

function computeStatus(
  value: number,
  good: number,
  fail: number,
  inverted: boolean
): MetricResult["status"] {
  if (inverted) {
    // Lower is better (e.g. hallucination_rate: good < 0.02, fail > 0.1)
    if (value <= good) return "good";
    if (value >= fail) return "fail";
    return "warning";
  }
  // Higher is better (e.g. tool_precision: good > 0.9, fail < 0.7)
  if (value >= good) return "good";
  if (value <= fail) return "fail";
  return "warning";
}

/** Filter traces that represent action requests (not greetings / simple questions). */
function actionTraces(traces: OperationalTrace[]): OperationalTrace[] {
  const actionIntents: string[] = [
    "action_request",
    "multi_step_request",
    "reminder_request",
  ];
  return traces.filter((t) => actionIntents.includes(t.interpretedIntent));
}

// ── Metric Definitions ──────────────────────────────────────────────

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // 1. tool_precision — כלים שהשתמשו בהם ובאמת היו נחוצים / סה״כ כלים שהופעלו
  {
    name: "tool_precision",
    description: "דיוק שימוש בכלים — כלים שהופעלו ובאמת נדרשו לעומת סך הכלים שהופעלו",
    compute: (traces) => {
      const withTools = traces.filter((t) => t.toolsUsed.length > 0);
      if (withTools.length === 0) return 1;
      // A tool is "unnecessary" when toolIntentType=none but tools were still used
      // Exclude tools that are always OK to use (info-gathering, instructions, etc.)
      const ALWAYS_OK_TOOLS = new Set(["learn_instruction", "forget_instruction", "list_instructions", "get_group_history", "summarize_group_activity", "get_contact_history", "list_contacts", "web_search", "list_events", "read_sms", "search_sms", "smart_home_status", "smart_home_list", "list_files", "read_file", "get_current_model"]);
      const totalToolUses = withTools.reduce((sum, t) => sum + t.toolsUsed.length, 0);
      const unnecessaryUses = withTools
        .filter((t) => t.toolIntentType === "none" && !t.shouldUseTool && !t.toolsUsed.every((tool) => ALWAYS_OK_TOOLS.has(tool)))
        .reduce((sum, t) => sum + t.toolsUsed.length, 0);
      return safeRatio(totalToolUses - unnecessaryUses, totalToolUses);
    },
    goodThreshold: 0.9,
    failThreshold: 0.7,
    requiredFields: ["toolsUsed", "toolIntentType", "shouldUseTool"],
  },

  // 2. tool_recall — כלים שהיו צריכים להיות בשימוש ואכן הופעלו
  {
    name: "tool_recall",
    description: "כיסוי כלים — כלים שנדרשו ואכן הופעלו לעומת כלים שנדרשו בסה״כ",
    compute: (traces) => {
      const needed = traces.filter((t) => t.toolIntentType !== "none" && t.shouldUseTool);
      if (needed.length === 0) return 1;
      const fulfilled = needed.filter((t) => t.toolsUsed.length > 0);
      return safeRatio(fulfilled.length, needed.length);
    },
    goodThreshold: 0.9,
    failThreshold: 0.7,
    requiredFields: ["toolsUsed", "toolIntentType", "shouldUseTool"],
  },

  // 3. hallucination_rate — אחוז traces עם הזיה
  {
    name: "hallucination_rate",
    description: "שיעור הזיות — אחוז התגובות שבהן זוהתה הזיה",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const hallucinated = traces.filter((t) => t.hadHallucination);
      return safeRatio(hallucinated.length, traces.length);
    },
    goodThreshold: 0.02,
    failThreshold: 0.1,
    requiredFields: ["hadHallucination"],
    invertedScale: true,
  },

  // 4. task_completion_rate — אחוז בקשות פעולה שהושלמו
  {
    name: "task_completion_rate",
    description: "שיעור השלמת משימות — בקשות פעולה שהסתיימו בהצלחה",
    compute: (traces) => {
      const actions = actionTraces(traces);
      if (actions.length === 0) return 1;
      const completed = actions.filter((t) => t.outcomeStatus === "completed");
      return safeRatio(completed.length, actions.length);
    },
    goodThreshold: 0.85,
    failThreshold: 0.6,
    requiredFields: ["outcomeStatus", "interpretedIntent"],
  },

  // 5. false_completion_rate — AI טענה שביצעה פעולה אבל לא באמת ביצעה
  {
    name: "false_completion_rate",
    description: "שיעור השלמות כוזבות — מקרים שבהם ה-AI טענה שביצעה פעולה בלי כלי",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const falseCompletions = traces.filter((t) =>
        t.selfCheck.flags.includes("action_claimed_not_executed" as SelfCheckFlag)
      );
      return safeRatio(falseCompletions.length, traces.length);
    },
    goodThreshold: 0.02,
    failThreshold: 0.05,
    requiredFields: ["selfCheck"],
    invertedScale: true,
  },

  // 6. followup_needed_rate — אחוז traces שדורשים followup (info only)
  {
    name: "followup_needed_rate",
    description: "שיעור צורך ב-followup — אחוז האינטראקציות שדורשות מעקב",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const needFollowup = traces.filter((t) => t.requiresFollowup);
      return safeRatio(needFollowup.length, traces.length);
    },
    goodThreshold: 1,   // info only — no pass/fail
    failThreshold: 0,
    requiredFields: ["requiresFollowup"],
  },

  // 7. self_check_critical_rate — אחוז traces עם alertLevel=critical
  {
    name: "self_check_critical_rate",
    description: "שיעור התראות קריטיות — אחוז האינטראקציות שהפעילו התראה קריטית",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const critical = traces.filter((t) => t.selfCheck.alertLevel === "critical");
      return safeRatio(critical.length, traces.length);
    },
    goodThreshold: 0.05,
    failThreshold: 0.15,
    requiredFields: ["selfCheck"],
    invertedScale: true,
  },

  // 8. avg_response_time_ms — זמן תגובה ממוצע
  {
    name: "avg_response_time_ms",
    description: "זמן תגובה ממוצע — ממוצע זמן עיבוד AI במילישניות",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const total = traces.reduce((sum, t) => sum + t.aiDurationMs, 0);
      return total / traces.length;
    },
    goodThreshold: 10000,
    failThreshold: 30000,
    requiredFields: ["aiDurationMs"],
    invertedScale: true,
  },

  // 9. contradiction_detection_rate — traces עם סתירות (info only)
  {
    name: "contradiction_detection_rate",
    description: "שיעור זיהוי סתירות — אחוז האינטראקציות שבהן זוהו סתירות",
    compute: (traces) => {
      if (traces.length === 0) return 0;
      const withContradictions = traces.filter(
        (t) =>
          t.contradictionFlags.length > 0 &&
          !t.contradictionFlags.every((c) => c === "none")
      );
      return safeRatio(withContradictions.length, traces.length);
    },
    goodThreshold: 1,   // info only
    failThreshold: 0,
    requiredFields: ["contradictionFlags"],
  },

  // 10. mood_adaptation_rate — traces שבהם mood!=neutral והטון הותאם (info only)
  {
    name: "mood_adaptation_rate",
    description: "שיעור התאמת טון — אחוז מצבי רגש לא-ניטרלי שבהם הטון הותאם",
    compute: (traces) => {
      const nonNeutral = traces.filter((t) => t.detectedMood !== "neutral");
      if (nonNeutral.length === 0) return 1;
      // We check selectedResponseStrategy — if mood was detected and strategy
      // adapted (not just direct_reply), we count it as adapted.
      // Heuristic: acknowledge_and_execute or acknowledge_and_followup suggest adaptation.
      const adaptiveStrategies: string[] = [
        "acknowledge_and_execute",
        "acknowledge_and_followup",
        "status_then_action",
      ];
      const adapted = nonNeutral.filter((t) =>
        adaptiveStrategies.includes(t.selectedResponseStrategy)
      );
      return safeRatio(adapted.length, nonNeutral.length);
    },
    goodThreshold: 1,   // info only
    failThreshold: 0,
    requiredFields: ["detectedMood", "selectedResponseStrategy"],
  },
];

// ── Main compute function ───────────────────────────────────────────

/**
 * חישוב מטריקות מתוך רשימת traces.
 * @param traces - כל ה-operational traces
 * @param period - תווית תקופה (לתצוגה בלבד)
 */
export function computeMetrics(
  traces: OperationalTrace[],
  period: string = "all"
): MetricsReport {
  const metrics: Record<string, MetricResult> = {};

  for (const def of METRIC_DEFINITIONS) {
    const value = def.compute(traces);
    const inverted = def.invertedScale ?? false;
    const status = computeStatus(value, def.goodThreshold, def.failThreshold, inverted);
    metrics[def.name] = { value: Math.round(value * 10000) / 10000, status };
  }

  // Top failures: count self-check flags across all traces, sorted by frequency
  const flagCounts: Record<string, number> = {};
  for (const t of traces) {
    for (const flag of t.selfCheck.flags) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }
  }
  const topFailures = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([flag]) => flag);

  return {
    period,
    totalTraces: traces.length,
    metrics,
    topFailures,
    generatedAt: new Date().toISOString(),
  };
}

// ── Period filtering helpers ────────────────────────────────────────

export function filterTracesByPeriod(
  traces: OperationalTrace[],
  period: "last_24h" | "last_7d" | "last_30d" | "all"
): OperationalTrace[] {
  if (period === "all") return traces;

  const now = Date.now();
  const cutoffs: Record<string, number> = {
    last_24h: now - 24 * 60 * 60 * 1000,
    last_7d: now - 7 * 24 * 60 * 60 * 1000,
    last_30d: now - 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = cutoffs[period];
  if (!cutoff) return traces;

  return traces.filter((t) => {
    const ts = new Date(t.timestamp).getTime();
    return ts >= cutoff;
  });
}
