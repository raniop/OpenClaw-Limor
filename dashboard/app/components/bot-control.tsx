"use client";

import { useState, useEffect } from "react";

export function BotControl({ initialRunning }: { initialRunning: boolean }) {
  const [running, setRunning] = useState(initialRunning);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll status every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/bot");
        const data = await res.json();
        setRunning(data.running);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(action: "start" | "stop" | "restart") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        // Wait a moment then check status
        await new Promise((r) => setTimeout(r, 3000));
        const check = await fetch("/api/bot");
        const status = await check.json();
        setRunning(status.running);
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div className="card" style={{ padding: "10px 18px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 10, height: 10, borderRadius: "50%",
        background: running ? "var(--success)" : "var(--danger)",
        boxShadow: running
          ? "0 0 10px var(--success-glow), 0 0 20px var(--success-glow)"
          : "0 0 10px var(--danger-glow)",
        animation: running ? "pulseGlow 2s ease-in-out infinite" : "none",
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 600, fontSize: 13, color: running ? "var(--success)" : "var(--danger)" }}>
        {loading ? "..." : running ? "Online" : "Offline"}
      </span>

      {!running && !loading && (
        <button className="btn btn-approve" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("start")}>
          Start
        </button>
      )}
      {running && !loading && (
        <>
          <button className="btn btn-reject" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("stop")}>
            Stop
          </button>
          <button className="btn btn-action" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("restart")}>
            Restart
          </button>
        </>
      )}
      {loading && (
        <span className="text-xs text-muted">Processing...</span>
      )}
      {error && (
        <span className="text-xs text-danger">{error}</span>
      )}
    </div>
  );
}
