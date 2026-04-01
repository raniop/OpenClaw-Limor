"use client";

import { AGENT_COLORS } from "../agent-config";
import type { AgentData } from "./AgentCharacter";

interface AgentHUDProps {
  agents: AgentData[];
  onSelectAgent: (agentId: string) => void;
}

export function AgentHUD({ agents, onSelectAgent }: AgentHUDProps) {
  // Put limor first, then alphabetical
  const sorted = [...agents].sort((a, b) => {
    if (a.id === "limor") return -1;
    if (b.id === "limor") return 1;
    return a.name.localeCompare(b.name, "he");
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(10, 10, 20, 0.85)",
        backdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        padding: "10px 16px",
        display: "flex",
        gap: 8,
        overflowX: "auto",
        justifyContent: "center",
      }}
    >
      {sorted.map((agent) => {
        const color = AGENT_COLORS[agent.id] || "#888";
        const isLimor = agent.id === "limor";

        return (
          <div
            key={agent.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              borderRadius: 8,
              border: isLimor ? `1px solid ${color}` : "1px solid transparent",
              background: isLimor ? "rgba(245, 158, 11, 0.1)" : "transparent",
              cursor: "pointer",
              transition: "background 0.2s",
              minWidth: 60,
            }}
            onClick={() => onSelectAgent(agent.id)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${color}15`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isLimor ? "rgba(245, 158, 11, 0.1)" : "transparent";
            }}
          >
            <span style={{ fontSize: 20 }}>{agent.emoji || "🤖"}</span>
            <span
              style={{
                fontSize: 11,
                color: "#e0e0e0",
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}
            >
              {agent.name}
            </span>
            {/* Role description */}
            <span
              style={{
                fontSize: 8,
                color: "#888",
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "nowrap",
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {agent.role || ""}
            </span>
            {/* Status dot */}
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: `0 0 4px #22c55e`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
