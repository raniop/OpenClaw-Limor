"use client";

import { useState, useEffect } from "react";

interface MetricResult {
  value: number;
  status: "good" | "warning" | "fail";
}

interface OpsData {
  traces: { total: number; last24h: number };
  metrics: {
    totalTraces: number;
    metrics: Record<string, MetricResult>;
    topFailures: string[];
  };
  passFail: {
    verdict: "pass" | "fail" | "warning";
    gatingMetrics: Array<{ name: string; value: number; threshold: number; passed: boolean; label?: string }>;
    blockers: string[];
    warnings: string[];
    summary: string;
  };
  topFailures: string[];
  recentAlerts: Array<{ traceId: string; flag: string; timestamp: string; contact: string }>;
}

const FLAG_LABELS: Record<string, string> = {
  action_claimed_not_executed: "טענה לפעולה בלי tool",
  tool_intended_not_used: "כלי נדרש ולא הופעל",
  unnecessary_tool_used: "כלי הופעל שלא לצורך",
  open_loop_unaddressed: "לולאה פתוחה לא טופלה",
  missing_info_unresolved: "מידע חסר לא טופל",
  contradiction_unresolved: "סתירה לא נפתרה",
  followup_needed: "נדרש follow-up",
  recovery_needed: "נדרש recovery",
  pending_state_unresolved: "pending state לא טופל",
  response_too_long: "תגובה ארוכה מדי",
  response_empty: "תגובה ריקה",
};

const METRIC_LABELS: Record<string, { name: string; desc: string; unit: "percent" | "ms" | "rate" }> = {
  tool_precision: { name: "דיוק כלים", desc: "מתוך כלים שהופעלו — כמה היו נחוצים", unit: "percent" },
  tool_recall: { name: "כיסוי כלים", desc: "מתוך מצבים שדרשו כלי — כמה באמת הופעלו", unit: "percent" },
  hallucination_rate: { name: "שיעור הזיות", desc: "טענות לביצוע פעולה בלי tool call", unit: "rate" },
  task_completion_rate: { name: "השלמת משימות", desc: "אחוז משימות שהושלמו בפועל", unit: "percent" },
  false_completion_rate: { name: "השלמות כוזבות", desc: "טענה שביצעה משימה אבל לא באמת", unit: "rate" },
  followup_needed_rate: { name: "follow-up נדרש", desc: "אחוז שיחות שדורשות המשך", unit: "rate" },
  self_check_critical_rate: { name: "התראות קריטיות", desc: "אחוז הודעות עם כשל קריטי", unit: "rate" },
  avg_response_time_ms: { name: "זמן תגובה ממוצע", desc: "משך זמן ממוצע לתשובה", unit: "ms" },
  contradiction_detection_rate: { name: "זיהוי סתירות", desc: "אחוז הודעות שזוהו בהן סתירות", unit: "rate" },
  mood_adaptation_rate: { name: "התאמת מצב רוח", desc: "התאמת אסטרטגיה למצב רוח", unit: "rate" },
};

const VERDICT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pass: { bg: "#dcfce7", color: "#166534", label: "✅ PASS — המערכת תקינה" },
  warning: { bg: "#fef9c3", color: "#854d0e", label: "⚠️ WARNING — יש בעיות" },
  fail: { bg: "#fee2e2", color: "#991b1b", label: "❌ FAIL — כשלים קריטיים" },
};

const STATUS_DOTS: Record<string, string> = {
  good: "#22c55e",
  warning: "#eab308",
  fail: "#ef4444",
};

function formatValue(key: string, value: number): string {
  const meta = METRIC_LABELS[key];
  if (!meta) return String(value);
  if (meta.unit === "ms") return `${Math.round(value).toLocaleString()}ms`;
  if (meta.unit === "percent") return `${(value * 100).toFixed(1)}%`;
  return `${(value * 100).toFixed(1)}%`; // rate
}

export default function OpsPage() {
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ops");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div><h1>Operations & QA</h1><p>טוען...</p></div>;
  if (error) return <div><h1>Operations & QA</h1><p style={{ color: "#ef4444" }}>שגיאה: {error}</p></div>;
  if (!data) return <div><h1>Operations & QA</h1><p>אין נתונים</p></div>;

  const metrics = data.metrics?.metrics ? Object.entries(data.metrics.metrics) : [];
  const verdict = VERDICT_STYLES[data.passFail?.verdict] || VERDICT_STYLES.warning;

  return (
    <div>
      <h1>Operations & QA</h1>
      <h2>בריאות המערכת, מדדים והתראות</h2>

      {/* Verdict Banner */}
      {data.passFail && (
        <div className="card mt-3" style={{
          padding: "16px 24px",
          background: verdict.bg,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: verdict.color }}>
              {verdict.label}
            </div>
            <div style={{ fontSize: 13, color: verdict.color, opacity: 0.8, marginTop: 4 }}>
              {data.passFail.summary}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: verdict.color }}>{data.traces?.last24h || 0}</div>
            <div style={{ fontSize: 11, color: verdict.color, opacity: 0.7 }}>הודעות ב-24ש</div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-3 mt-3">
        <div className="stat-card">
          <div className="stat-label">סה&quot;כ traces</div>
          <div className="stat-value">{data.traces?.total || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">התראות קריטיות</div>
          <div className="stat-value" style={{ color: (data.recentAlerts?.length || 0) > 0 ? "#ef4444" : "#22c55e" }}>
            {data.recentAlerts?.length || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">כשל מוביל</div>
          <div className="stat-value" style={{ fontSize: 14 }}>
            {data.topFailures?.[0] ? FLAG_LABELS[data.topFailures[0]] || data.topFailures[0] : "אין 🎉"}
          </div>
        </div>
      </div>

      {/* Metrics Table */}
      <div className="section-header mt-4">מדדים</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {metrics.length === 0 ? (
          <div className="empty-state">אין מדדים עדיין — צריך יותר traces</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>מדד</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "center", borderBottom: "1px solid var(--glass-border)" }}>ערך</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "center", borderBottom: "1px solid var(--glass-border)" }}>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([key, m]) => {
                const meta = METRIC_LABELS[key] || { name: key, desc: "", unit: "percent" as const };
                return (
                  <tr key={key} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{meta.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{meta.desc}</div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 16, fontFamily: "monospace" }}>
                      {formatValue(key, m.value)}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: STATUS_DOTS[m.status] || "#9ca3af",
                      }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Gating Metrics */}
      {data.passFail?.gatingMetrics && data.passFail.gatingMetrics.length > 0 && (
        <>
          <div className="section-header mt-4">Gating Metrics (חייבים לעבור)</div>
          <div className="card" style={{ padding: "12px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {data.passFail.gatingMetrics.map((g) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: g.passed ? "#22c55e" : "#ef4444",
                }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label || METRIC_LABELS[g.name]?.name || g.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                  {g.name === "avg_response_time_ms"
                    ? `${Math.round(g.value).toLocaleString()}ms`
                    : `${(g.value * 100).toFixed(1)}%`
                  }
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent Alerts */}
      <div className="section-header mt-4">התראות אחרונות</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {(!data.recentAlerts || data.recentAlerts.length === 0) ? (
          <div className="empty-state">אין התראות — המערכת בריאה 🎉</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>שעה</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>איש קשר</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>בעיה</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAlerts.slice(0, 20).map((a, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <td style={{ padding: "8px 14px", fontSize: 12, fontFamily: "monospace" }}>{new Date(a.timestamp).toLocaleTimeString("he-IL")}</td>
                  <td style={{ padding: "8px 14px", fontSize: 13 }}>{a.contact}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "#ef4444" }}>{FLAG_LABELS[a.flag] || a.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Recurring Failures */}
      {data.topFailures && data.topFailures.length > 0 && (
        <>
          <div className="section-header mt-4">כשלים חוזרים</div>
          <div className="card" style={{ padding: "12px 20px" }}>
            {data.topFailures.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>#{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{FLAG_LABELS[f] || f}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
