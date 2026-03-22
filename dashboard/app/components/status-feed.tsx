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
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  text: { label: "✅ הגיב", color: "var(--success)" },
  tool_use: { label: "🔧 כלי", color: "var(--accent)" },
  muted_group: { label: "🔇 מושתק", color: "var(--text-tertiary)" },
  group_filtered: { label: "⏭️ סינון", color: "var(--text-tertiary)" },
  unauthorized: { label: "🚫 לא מורשה", color: "var(--warning)" },
  error: { label: "❌ שגיאה", color: "var(--danger)" },
  skip: { label: "⏭️ דילוג", color: "var(--text-tertiary)" },
  react: { label: "👍 תגובה", color: "var(--success)" },
};

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
    return <div className="text-muted text-sm" style={{ textAlign: "center", padding: "8px 0" }}>טוען...</div>;
  }

  return (
    <div>
      {/* Feed entries */}
      {data.recentFeed.length === 0 ? (
        <div className="text-muted text-sm" style={{ textAlign: "center" }}>אין הודעות אחרונות</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {data.recentFeed.slice(0, 8).map((entry, i) => {
            const outcome = OUTCOME_CONFIG[entry.outcome] || { label: entry.outcome, color: "var(--text-secondary)" };
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 8px", borderRadius: 4,
                background: "rgba(128,128,128,0.03)",
                fontSize: 12,
              }}>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0, minWidth: 40 }}>
                  {new Date(entry.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: 80 }}>
                  {entry.contact}
                </span>
                <span style={{ color: "var(--text-tertiary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.action}
                </span>
                <span style={{ fontSize: 10, color: outcome.color, flexShrink: 0 }}>
                  {outcome.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
