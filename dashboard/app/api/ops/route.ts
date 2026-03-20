import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * GET /api/ops — Operational metrics dashboard endpoint.
 *
 * Returns metrics report, pass/fail evaluation, top failures, and recent alerts
 * computed from the operational traces stored in workspace/state/operational-traces.json.
 *
 * We inline the computation logic here (mirrored from src/ops/metrics.ts and
 * src/ops/pass-fail.ts) because the dashboard is a Next.js app with its own
 * build, and importing from the bot's src/ would create a cross-project dependency.
 */

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const TRACE_FILE = resolve(STATE_DIR, "operational-traces.json");

// ── Lightweight types (mirrors src/ops) ─────────────────────────────

interface SelfCheckResult {
  flags: string[];
  alertLevel: "ok" | "warning" | "critical";
  summary: string;
}

interface OperationalTrace {
  traceId: string;
  timestamp: string;
  chatId: string;
  contactName: string;
  isOwner: boolean;
  isGroup: boolean;
  interpretedIntent: string;
  toolIntentType: string;
  shouldUseTool: boolean;
  toolsUsed: string[];
  outcomeStatus: string;
  requiresFollowup: boolean;
  aiDurationMs: number;
  detectedMood: string;
  selectedResponseStrategy: string;
  hadHallucination: boolean;
  contradictionFlags: string[];
  selfCheck: SelfCheckResult;
  [key: string]: unknown;
}

interface MetricResult {
  value: number;
  status: "good" | "warning" | "fail";
}

interface MetricsReport {
  period: string;
  totalTraces: number;
  metrics: Record<string, MetricResult>;
  topFailures: string[];
  generatedAt: string;
}

interface GatingMetricResult {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
}

interface PassFailResult {
  verdict: "pass" | "fail" | "warning";
  gatingMetrics: GatingMetricResult[];
  blockers: string[];
  warnings: string[];
  summary: string;
}

interface RecentAlert {
  traceId: string;
  flag: string;
  timestamp: string;
}

// ── Load traces ─────────────────────────────────────────────────────

function loadTraces(): OperationalTrace[] {
  try {
    if (!existsSync(TRACE_FILE)) return [];
    const raw = readFileSync(TRACE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.traces)) {
      return parsed.traces;
    }
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function filterByPeriod(traces: OperationalTrace[], hours: number): OperationalTrace[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return traces.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
}

// ── Metrics computation (mirrors src/ops/metrics.ts) ────────────────

function safeRatio(num: number, den: number): number {
  return den === 0 ? 1 : num / den;
}

function computeMetricsReport(traces: OperationalTrace[], period: string): MetricsReport {
  const metrics: Record<string, MetricResult> = {};

  const actionIntents = ["action_request", "multi_step_request", "reminder_request"];
  const actionTraces = traces.filter((t) => actionIntents.includes(t.interpretedIntent));

  // 1. tool_precision
  const withTools = traces.filter((t) => t.toolsUsed.length > 0);
  const totalToolUses = withTools.reduce((s, t) => s + t.toolsUsed.length, 0);
  const unnecessaryUses = withTools
    .filter((t) => t.toolIntentType === "none" && !t.shouldUseTool)
    .reduce((s, t) => s + t.toolsUsed.length, 0);
  const toolPrecision = safeRatio(totalToolUses - unnecessaryUses, totalToolUses);
  metrics.tool_precision = {
    value: round4(toolPrecision),
    status: toolPrecision >= 0.9 ? "good" : toolPrecision <= 0.7 ? "fail" : "warning",
  };

  // 2. tool_recall
  const needed = traces.filter((t) => t.toolIntentType !== "none" && t.shouldUseTool);
  const fulfilled = needed.filter((t) => t.toolsUsed.length > 0);
  const toolRecall = safeRatio(fulfilled.length, needed.length);
  metrics.tool_recall = {
    value: round4(toolRecall),
    status: toolRecall >= 0.9 ? "good" : toolRecall <= 0.7 ? "fail" : "warning",
  };

  // 3. hallucination_rate
  const hallRate = safeRatio(
    traces.filter((t) => t.hadHallucination).length,
    traces.length
  );
  metrics.hallucination_rate = {
    value: round4(hallRate),
    status: hallRate <= 0.02 ? "good" : hallRate >= 0.1 ? "fail" : "warning",
  };

  // 4. task_completion_rate
  const completionRate = safeRatio(
    actionTraces.filter((t) => t.outcomeStatus === "completed").length,
    actionTraces.length
  );
  metrics.task_completion_rate = {
    value: round4(completionRate),
    status: completionRate >= 0.85 ? "good" : completionRate <= 0.6 ? "fail" : "warning",
  };

  // 5. false_completion_rate
  const falseRate = safeRatio(
    traces.filter((t) => t.selfCheck.flags.includes("action_claimed_not_executed")).length,
    traces.length
  );
  metrics.false_completion_rate = {
    value: round4(falseRate),
    status: falseRate <= 0.02 ? "good" : falseRate >= 0.05 ? "fail" : "warning",
  };

  // 6. followup_needed_rate (info)
  const followupRate = safeRatio(
    traces.filter((t) => t.requiresFollowup).length,
    traces.length
  );
  metrics.followup_needed_rate = { value: round4(followupRate), status: "good" };

  // 7. self_check_critical_rate
  const critRate = safeRatio(
    traces.filter((t) => t.selfCheck.alertLevel === "critical").length,
    traces.length
  );
  metrics.self_check_critical_rate = {
    value: round4(critRate),
    status: critRate <= 0.05 ? "good" : critRate >= 0.15 ? "fail" : "warning",
  };

  // 8. avg_response_time_ms
  const avgTime =
    traces.length === 0
      ? 0
      : traces.reduce((s, t) => s + t.aiDurationMs, 0) / traces.length;
  metrics.avg_response_time_ms = {
    value: Math.round(avgTime),
    status: avgTime <= 10000 ? "good" : avgTime >= 30000 ? "fail" : "warning",
  };

  // 9. contradiction_detection_rate (info)
  const contradRate = safeRatio(
    traces.filter(
      (t) => t.contradictionFlags.length > 0 && !t.contradictionFlags.every((c) => c === "none")
    ).length,
    traces.length
  );
  metrics.contradiction_detection_rate = { value: round4(contradRate), status: "good" };

  // 10. mood_adaptation_rate (info)
  const nonNeutral = traces.filter((t) => t.detectedMood !== "neutral");
  const adaptiveStrategies = ["acknowledge_and_execute", "acknowledge_and_followup", "status_then_action"];
  const moodRate =
    nonNeutral.length === 0
      ? 1
      : safeRatio(
          nonNeutral.filter((t) => adaptiveStrategies.includes(t.selectedResponseStrategy)).length,
          nonNeutral.length
        );
  metrics.mood_adaptation_rate = { value: round4(moodRate), status: "good" };

  // Top failures
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

// ── Pass/Fail (mirrors src/ops/pass-fail.ts) ────────────────────────

function evaluatePassFail(report: MetricsReport): PassFailResult {
  const gating: Array<{ name: string; threshold: number; mode: "min" | "max"; label: string }> = [
    { name: "tool_precision", threshold: 0.7, mode: "min", label: "דיוק שימוש בכלים" },
    { name: "hallucination_rate", threshold: 0.1, mode: "max", label: "שיעור הזיות" },
    { name: "false_completion_rate", threshold: 0.05, mode: "max", label: "שיעור השלמות כוזבות" },
    { name: "self_check_critical_rate", threshold: 0.15, mode: "max", label: "שיעור התראות קריטיות" },
  ];

  const warningDefs: Array<{ name: string; threshold: number; mode: "min" | "max"; label: string }> = [
    { name: "task_completion_rate", threshold: 0.85, mode: "min", label: "שיעור השלמת משימות נמוך" },
    { name: "avg_response_time_ms", threshold: 15000, mode: "max", label: "זמן תגובה ממוצע גבוה" },
  ];

  const gatingMetrics: GatingMetricResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const g of gating) {
    const m = report.metrics[g.name];
    const value = m?.value ?? 0;
    const passed = g.mode === "min" ? value >= g.threshold : value <= g.threshold;
    gatingMetrics.push({ name: g.name, value, threshold: g.threshold, passed });
    if (!passed) blockers.push(g.label);
  }

  for (const w of warningDefs) {
    const m = report.metrics[w.name];
    const value = m?.value ?? 0;
    const passed = w.mode === "min" ? value >= w.threshold : value <= w.threshold;
    if (!passed) warnings.push(w.label);
  }

  const verdict: PassFailResult["verdict"] =
    blockers.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass";

  const summary =
    verdict === "pass"
      ? "עובר: כל המטריקות החוסמות עברו בהצלחה."
      : verdict === "fail"
        ? `נכשל: ${blockers.join(", ")}`
        : `אזהרה: ${warnings.join(", ")}`;

  return { verdict, gatingMetrics, blockers, warnings, summary };
}

// ── Recent alerts ───────────────────────────────────────────────────

function getRecentAlerts(traces: OperationalTrace[], limit: number = 20): RecentAlert[] {
  const alerts: RecentAlert[] = [];
  // Walk backwards for recency
  for (let i = traces.length - 1; i >= 0 && alerts.length < limit; i--) {
    const t = traces[i];
    if (t.selfCheck.alertLevel !== "ok") {
      for (const flag of t.selfCheck.flags) {
        alerts.push({ traceId: t.traceId, flag, timestamp: t.timestamp });
      }
    }
  }
  return alerts.slice(0, limit);
}

// ── Helpers ─────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ── Route handler ───────────────────────────────────────────────────

export async function GET() {
  const allTraces = loadTraces();
  const last24h = filterByPeriod(allTraces, 24);

  const report = computeMetricsReport(allTraces, "all");
  const passFail = evaluatePassFail(report);
  const recentAlerts = getRecentAlerts(allTraces);

  return NextResponse.json({
    traces: {
      total: allTraces.length,
      last24h: last24h.length,
    },
    metrics: report,
    passFail,
    topFailures: report.topFailures,
    recentAlerts,
  });
}
