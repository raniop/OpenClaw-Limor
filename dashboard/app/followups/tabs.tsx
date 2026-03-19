"use client";

import { useState, ReactNode } from "react";

export function FollowupTabs({
  activeContent,
  completedContent,
  activeCount,
  completedCount,
}: {
  activeContent: ReactNode;
  completedContent: ReactNode;
  activeCount: number;
  completedCount: number;
}) {
  const [tab, setTab] = useState<"active" | "completed">("active");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setTab("active")}
          className={tab === "active" ? "btn btn-action" : "btn"}
          style={{
            padding: "6px 16px", fontSize: 13,
            background: tab === "active" ? undefined : "var(--surface)",
            color: tab === "active" ? undefined : "var(--text-secondary)",
            border: tab === "active" ? undefined : "1px solid var(--glass-border)",
          }}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setTab("completed")}
          className={tab === "completed" ? "btn btn-action" : "btn"}
          style={{
            padding: "6px 16px", fontSize: 13,
            background: tab === "completed" ? undefined : "var(--surface)",
            color: tab === "completed" ? undefined : "var(--text-secondary)",
            border: tab === "completed" ? undefined : "1px solid var(--glass-border)",
          }}
        >
          Completed ({completedCount})
        </button>
      </div>

      {tab === "active" ? activeContent : completedContent}
    </div>
  );
}
