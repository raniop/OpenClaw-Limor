"use client";

import { useState, useEffect } from "react";

interface LogLine {
  raw: string;
  timestamp?: string;
  level?: string;
  domain?: string;
  message?: string;
}

const LEVEL_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  ERROR: { color: "var(--danger)", bg: "rgba(239,68,68,0.08)", icon: "🔴" },
  WARN: { color: "var(--warning)", bg: "rgba(234,179,8,0.08)", icon: "🟡" },
  INFO: { color: "var(--text-secondary)", bg: "transparent", icon: "🔵" },
};

export function LiveLogs() {
  const [logs, setLogs] = useState<LogLine[]>([]);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/logs?limit=50");
        const data = await res.json();
        const parsed = (data.logs || []).filter((l: LogLine) => l.timestamp && l.level && l.domain);
        setLogs(parsed.slice(0, 8).reverse());
      } catch {}
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="text-muted text-sm" style={{ textAlign: "center", padding: "8px 0" }}>
        אין לוגים
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {logs.map((line, i) => {
        const style = LEVEL_STYLES[line.level || "INFO"] || LEVEL_STYLES.INFO;
        return (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            borderRadius: 4,
            background: style.bg,
            fontSize: 11,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
          }}>
            <span style={{ fontSize: 8, flexShrink: 0 }}>{style.icon}</span>
            <span style={{ color: "var(--text-tertiary)", flexShrink: 0, minWidth: 55 }}>
              {line.timestamp && new Date(line.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{line.domain}</span>
            <span style={{
              color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {line.message?.substring(0, 100)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
