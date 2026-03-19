"use client";

import { useState, useEffect } from "react";

export function BotControl({ initialRunning }: { initialRunning: boolean }) {
  const [running, setRunning] = useState(initialRunning);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Poll status every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/bot");
        const data = await res.json();
        setRunning(data.running);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(action: "start" | "stop" | "restart") {
    setLoading(true);
    setError(null);
    setStatusText(action === "start" ? "Building & starting..." : action === "stop" ? "Stopping..." : "Restarting...");
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setRunning(action !== "stop");
        setStatusText(data.message || "");
        // Clear message after 3s
        setTimeout(() => setStatusText(""), 3000);
      } else {
        setError(data.error || "Failed");
        setStatusText("");
      }
    } catch (e: any) {
      setError(e.message);
      setStatusText("");
    }
    setLoading(false);
  }

  return (
    <div className="card" style={{ padding: "10px 18px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 12 }}>
      <span style={{
        width: 10, height: 10, borderRadius: "50%",
        background: loading ? "var(--warning)" : running ? "var(--success)" : "var(--danger)",
        boxShadow: loading
          ? "0 0 10px var(--warning-glow)"
          : running
            ? "0 0 10px var(--success-glow), 0 0 20px var(--success-glow)"
            : "0 0 10px var(--danger-glow)",
        animation: "pulseGlow 2s ease-in-out infinite",
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{ fontWeight: 600, fontSize: 13, color: loading ? "var(--warning)" : running ? "var(--success)" : "var(--danger)" }}>
        {loading ? statusText : running ? "Online" : "Offline"}
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
      {error && (
        <span className="text-xs text-danger" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{error}</span>
      )}
    </div>
  );
}
