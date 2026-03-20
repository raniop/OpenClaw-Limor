/**
 * Pass/Fail Framework — הערכת מוכנות לפריסה (ship gate).
 * מטריקות חוסמות חייבות לעבור כדי לשחרר, אזהרות מדווחות אך לא חוסמות.
 */
import type { MetricsReport, MetricResult } from "./metrics";

// ── Types ────────────────────────────────────────────────────────────

export interface GatingMetricResult {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface PassFailResult {
  verdict: "pass" | "fail" | "warning";
  gatingMetrics: GatingMetricResult[];
  blockers: string[];
  warnings: string[];
  summary: string; // Hebrew
}

// ── Gating & Warning definitions ────────────────────────────────────

interface GatingCheck {
  metricName: string;
  /** The threshold value. For "max" checks the metric must be <= threshold;
   *  for "min" checks the metric must be >= threshold. */
  threshold: number;
  mode: "min" | "max"; // min = metric must be >= threshold, max = metric must be <= threshold
  label: string; // Hebrew
}

const GATING_METRICS: GatingCheck[] = [
  {
    metricName: "tool_precision",
    threshold: 0.7,
    mode: "min",
    label: "דיוק שימוש בכלים",
  },
  {
    metricName: "hallucination_rate",
    threshold: 0.1,
    mode: "max",
    label: "שיעור הזיות",
  },
  {
    metricName: "false_completion_rate",
    threshold: 0.05,
    mode: "max",
    label: "שיעור השלמות כוזבות",
  },
  {
    metricName: "self_check_critical_rate",
    threshold: 0.15,
    mode: "max",
    label: "שיעור התראות קריטיות",
  },
];

interface WarningCheck {
  metricName: string;
  threshold: number;
  mode: "min" | "max";
  label: string;
}

const WARNING_METRICS: WarningCheck[] = [
  {
    metricName: "task_completion_rate",
    threshold: 0.85,
    mode: "min",
    label: "שיעור השלמת משימות נמוך",
  },
  {
    metricName: "avg_response_time_ms",
    threshold: 15000,
    mode: "max",
    label: "זמן תגובה ממוצע גבוה",
  },
];

// ── Evaluation ──────────────────────────────────────────────────────

function checkMetric(
  report: MetricsReport,
  check: { metricName: string; threshold: number; mode: "min" | "max" }
): { value: number; passed: boolean } {
  const metric: MetricResult | undefined = report.metrics[check.metricName];
  if (!metric) {
    // Metric not available — assume pass (no data to judge)
    return { value: 0, passed: true };
  }
  const passed =
    check.mode === "min"
      ? metric.value >= check.threshold
      : metric.value <= check.threshold;
  return { value: metric.value, passed };
}

/**
 * הערכת pass/fail מתוך דוח מטריקות.
 */
export function evaluatePassFail(report: MetricsReport): PassFailResult {
  const gatingMetrics: GatingMetricResult[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Evaluate gating metrics
  for (const check of GATING_METRICS) {
    const { value, passed } = checkMetric(report, check);
    gatingMetrics.push({
      name: check.metricName,
      value,
      threshold: check.threshold,
      passed,
    });
    if (!passed) {
      const direction = check.mode === "min" ? "מתחת ל" : "מעל";
      blockers.push(
        `${check.label}: ${(value * 100).toFixed(1)}% (${direction}-${(check.threshold * 100).toFixed(0)}%)`
      );
    }
  }

  // Evaluate warning metrics
  for (const check of WARNING_METRICS) {
    const { value, passed } = checkMetric(report, check);
    if (!passed) {
      if (check.metricName === "avg_response_time_ms") {
        warnings.push(
          `${check.label}: ${Math.round(value)}ms (סף: ${check.threshold}ms)`
        );
      } else {
        const direction = check.mode === "min" ? "מתחת ל" : "מעל";
        warnings.push(
          `${check.label}: ${(value * 100).toFixed(1)}% (${direction}-${(check.threshold * 100).toFixed(0)}%)`
        );
      }
    }
  }

  // Determine verdict
  let verdict: PassFailResult["verdict"];
  if (blockers.length > 0) {
    verdict = "fail";
  } else if (warnings.length > 0) {
    verdict = "warning";
  } else {
    verdict = "pass";
  }

  // Build Hebrew summary
  let summary: string;
  if (verdict === "pass") {
    summary = `עובר: כל ${gatingMetrics.length} מטריקות חוסמות עברו בהצלחה.`;
  } else if (verdict === "fail") {
    summary = `נכשל: ${blockers.length} מטריקה/ות חוסמת/ות לא עברו — ${blockers.join("; ")}.`;
  } else {
    summary = `אזהרה: כל מטריקות החסימה עברו, אך יש ${warnings.length} אזהרה/ות — ${warnings.join("; ")}.`;
  }

  return {
    verdict,
    gatingMetrics,
    blockers,
    warnings,
    summary,
  };
}
