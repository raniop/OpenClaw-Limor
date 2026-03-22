"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  count?: number;
  children: ReactNode;
}

export function CollapsibleSection({ title, icon, defaultOpen = true, count, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 0",
          marginBottom: open ? 6 : 0,
        }}
      >
        <span style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          transition: "transform 0.2s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
        }}>
          ▶
        </span>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span className="section-header" style={{ margin: 0, fontSize: 13 }}>{title}</span>
        {count !== undefined && count > 0 && (
          <span style={{
            fontSize: 10,
            background: "rgba(128,128,128,0.15)",
            padding: "1px 6px",
            borderRadius: 8,
            color: "var(--text-secondary)",
          }}>
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="card" style={{ padding: "10px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
