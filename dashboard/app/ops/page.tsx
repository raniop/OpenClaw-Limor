"use client";

import { useState, useEffect } from "react";

interface MetricResult {
  name: string;
  value: number;
  status: "good" | "warning" | "fail";
  description: string;
  goodThreshold: number;
  failThreshold: number;
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
    gatingMetrics: Array<{ name: string; value: number; threshold: number; passed: boolean }>;
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

const VERDICT_COLORS: Record<string, string> = {
  pass: "var(--success)",
  warning: "var(--warning)",
  fail: "var(--danger)",
};

const STATUS_COLORS: Record<string, string> = {
  good: "var(--success)",
  warning: "var(--warning)",
  fail: "var(--danger)",
};

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

  if (loading) return <div><h1>Operations</h1><p>Loading...</p></div>;
  if (error) return <div><h1>Operations</h1><p className="text-danger">Error: {error}</p></div>;
  if (!data) return <div><h1>Operations</h1><p>No data</p></div>;

  const metrics = data.metrics?.metrics ? Object.values(data.metrics.metrics) : [];

  return (
    <div>
      <h1>Operations & QA</h1>
      <h2>System health, metrics, and alerts</h2>

      {/* Verdict Banner */}
      {data.passFail && (
        <div className="card mt-3" style={{
          padding: "16px 24px",
          borderLeft: `4px solid ${VERDICT_COLORS[data.passFail.verdict] || "var(--text-tertiary)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: VERDICT_COLORS[data.passFail.verdict] }}>
              {data.passFail.verdict === "pass" ? "✅ PASS" : data.passFail.verdict === "warning" ? "⚠️ WARNING" : "❌ FAIL"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {data.passFail.summary}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.traces?.total || 0}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>total traces</div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-3 mt-3">
        <div className="stat-card">
          <div className="stat-label">Traces (24h)</div>
          <div className="stat-value">{data.traces?.last24h || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical Alerts</div>
          <div className="stat-value" style={{ color: (data.recentAlerts?.length || 0) > 0 ? "var(--danger)" : "var(--success)" }}>
            {data.recentAlerts?.length || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top Failure</div>
          <div className="stat-value" style={{ fontSize: 14 }}>
            {data.topFailures?.[0] ? FLAG_LABELS[data.topFailures[0]] || data.topFailures[0] : "None"}
          </div>
        </div>
      </div>

      {/* Metrics Table */}
      <div className="section-header mt-4">Metrics</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {metrics.length === 0 ? (
          <div className="empty-state">No metrics yet — need more traces</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Metric</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid var(--glass-border)" }}>Value</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid var(--glass-border)" }}>Status</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Thresholds</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.name} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.description}</div>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 16, fontFamily: "monospace" }}>
                    {typeof m.value === "number" ? (m.value > 100 ? Math.round(m.value) : (m.value * 100).toFixed(1) + "%") : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_COLORS[m.status] || "var(--text-tertiary)",
                    }} />
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
                    Good: {m.goodThreshold > 100 ? `<${m.goodThreshold}` : `>${(m.goodThreshold * 100).toFixed(0)}%`} | Fail: {m.failThreshold > 100 ? `>${m.failThreshold}` : `<${(m.failThreshold * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Gating Metrics */}
      {data.passFail?.gatingMetrics && data.passFail.gatingMetrics.length > 0 && (
        <>
          <div className="section-header mt-4">Gating Metrics (must pass to ship)</div>
          <div className="card" style={{ padding: "12px 20px", display: "flex", gap: 24, flexWrap: "wrap" }}>
            {data.passFail.gatingMetrics.map((g) => (
              <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: g.passed ? "var(--success)" : "var(--danger)",
                }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                  {(g.value * 100).toFixed(1)}% (threshold: {(g.threshold * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent Alerts */}
      <div className="section-header mt-4">Recent Alerts</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {(!data.recentAlerts || data.recentAlerts.length === 0) ? (
          <div className="empty-state">No alerts — system healthy</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Time</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Contact</th>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAlerts.slice(0, 20).map((a, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <td style={{ padding: "8px 14px", fontSize: 12, fontFamily: "monospace" }}>{new Date(a.timestamp).toLocaleTimeString("he-IL")}</td>
                  <td style={{ padding: "8px 14px", fontSize: 13 }}>{a.contact}</td>
                  <td style={{ padding: "8px 14px", fontSize: 12, color: "var(--danger)" }}>{FLAG_LABELS[a.flag] || a.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Recurring Failures */}
      {data.topFailures && data.topFailures.length > 0 && (
        <>
          <div className="section-header mt-4">Top Recurring Failures</div>
          <div className="card" style={{ padding: "12px 20px" }}>
            {data.topFailures.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span style={{ fontSize: 14 }}>#{i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{FLAG_LABELS[f] || f}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
