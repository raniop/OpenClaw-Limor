"use client";

import { useState, useEffect } from "react";

interface StatusData {
  isOnline: boolean;
  lastMessageAt: string;
  messagesToday: number;
  groupsFiltered: number;
  activeFollowups: number;
  recentFeed: Array<{
    time: string;
    contact: string;
    action: string;
    outcome: string;
  }>;
}

function timeAgo(isoStr: string): string {
  if (!isoStr) return "N/A";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function outcomeColor(outcome: string): string {
  if (outcome === "text" || outcome === "tool_use") return "var(--success)";
  if (outcome === "muted_group" || outcome === "group_filtered") return "var(--text-tertiary)";
  if (outcome === "error") return "var(--danger)";
  if (outcome === "unauthorized") return "var(--warning)";
  return "var(--text-secondary)";
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "text": return "Replied";
    case "tool_use": return "Tool used";
    case "muted_group": return "Group muted";
    case "group_filtered": return "Group filtered";
    case "unauthorized": return "Unauthorized";
    case "error": return "Error";
    default: return outcome;
  }
}

export function StatusFeed() {
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        setData(json);
      } catch {}
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="text-muted text-sm" style={{ textAlign: "center", padding: "12px 0" }}>
        טוען סטטוס...
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    textAlign: "start",
    borderBottom: "1px solid var(--glass-border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: 12,
    borderBottom: "1px solid rgba(128,128,128,0.06)",
  };

  return (
    <div>
      {/* Status Bar */}
      <div className="card" style={{
        padding: "10px 20px",
        display: "flex",
        gap: 20,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: data.isOnline ? "var(--success)" : "var(--danger)",
            boxShadow: `0 0 8px ${data.isOnline ? "var(--success-glow)" : "var(--danger-glow)"}`,
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            Limor {data.isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <span style={{ color: "var(--glass-border)" }}>|</span>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Last message: </span>
          <span style={{ fontWeight: 500 }}>{timeAgo(data.lastMessageAt)}</span>
        </div>

        <span style={{ color: "var(--glass-border)" }}>|</span>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Messages today: </span>
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>{data.messagesToday}</span>
        </div>

        <span style={{ color: "var(--glass-border)" }}>|</span>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Groups filtered: </span>
          <span style={{ fontWeight: 500 }}>{data.groupsFiltered}</span>
        </div>
      </div>

      {/* Live Feed Table */}
      <div className="section-header">Live Message Feed</div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {data.recentFeed.length === 0 ? (
          <div className="empty-state">No recent messages</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFeed.map((entry, i) => (
                <tr key={i} style={{ transition: "background 0.15s" }}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: 11, color: "var(--text-tertiary)" }}>
                    {new Date(entry.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500, color: "var(--text-primary)" }}>
                    {entry.contact}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                    {entry.action}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: outcomeColor(entry.outcome),
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: `color-mix(in srgb, ${outcomeColor(entry.outcome)} 10%, transparent)`,
                    }}>
                      {outcomeLabel(entry.outcome)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
