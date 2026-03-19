"use client";

import { useState, useEffect } from "react";

interface LogLine {
  raw: string;
  timestamp?: string;
  level?: string;
  domain?: string;
  message?: string;
}

export function LiveLogs() {
  const [logs, setLogs] = useState<LogLine[]>([]);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/logs?limit=5");
        const data = await res.json();
        setLogs(data.logs || []);
      } catch {}
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="text-muted text-sm" style={{ textAlign: "center", padding: "12px 0" }}>
        No logs yet — start Limor to see activity
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.8 }}>
      {logs.map((line, i) => (
        <div key={i} style={{ color: "var(--text-secondary)" }}>
          {line.timestamp && (
            <span style={{ color: "var(--text-tertiary)" }}>
              {new Date(line.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}{" "}
          <span style={{
            color: line.level === "ERROR" ? "var(--danger)" : line.level === "WARN" ? "var(--warning)" : "var(--text-primary)",
            fontWeight: line.level === "ERROR" ? 700 : 400,
          }}>
            {line.level}
          </span>{" "}
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>[{line.domain}]</span>{" "}
          <span style={{ color: "var(--text-primary)" }}>{line.message?.substring(0, 80)}</span>
        </div>
      ))}
      <div className="text-xs text-muted mt-2">View all logs →</div>
    </div>
  );
}
