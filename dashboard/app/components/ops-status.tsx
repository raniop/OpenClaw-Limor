"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface OpsStatusData {
  verdict: "pass" | "fail" | "warning";
  summary: string;
  tracesLast24h: number;
  totalTraces: number;
}

const VERDICT_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pass: { color: "var(--success)", bg: "rgba(52,199,89,0.12)", label: "PASS" },
  warning: { color: "var(--warning)", bg: "rgba(255,159,10,0.12)", label: "WARNING" },
  fail: { color: "var(--danger)", bg: "rgba(255,69,58,0.12)", label: "FAIL" },
};

export function OpsStatus() {
  const [data, setData] = useState<OpsStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ops");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData({
          verdict: json.passFail?.verdict || "warning",
          summary: json.passFail?.summary || "",
          tracesLast24h: json.traces?.last24h || 0,
          totalTraces: json.traces?.total || 0,
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="stat-card" style={{ opacity: 0.5 }}>
        <div className="stat-label">Operations</div>
        <div className="stat-value" style={{ fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <Link href="/ops" className="stat-card">
        <div className="stat-label">Operations</div>
        <div className="stat-value" style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Unavailable</div>
      </Link>
    );
  }

  const style = VERDICT_STYLE[data.verdict] || VERDICT_STYLE.warning;

  return (
    <Link href="/ops" className="stat-card" style={{ position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="stat-label">Operations</div>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 4,
          background: style.bg,
          color: style.color,
          letterSpacing: "0.05em",
        }}>
          {style.label}
        </span>
      </div>
      <div className="stat-value">{data.tracesLast24h}</div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
        traces in last 24h ({data.totalTraces} total)
      </div>
    </Link>
  );
}
