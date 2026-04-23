"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { AgentHUD } from "./components/AgentHUD";
import { FloorSelector } from "./components/FloorSelector";
import type { AgentData } from "./components/AgentCharacter";
import { AGENT_DESKS } from "./agent-config";

const Scene = dynamic(() => import("./components/Scene"), { ssr: false });

export default function WorldPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState(2); // default to offices

  const handleFocusDone = useCallback(() => setFocusedAgent(null), []);

  // When clicking an agent, auto-switch to their floor
  const handleSelectAgent = useCallback((agentId: string) => {
    const desk = AGENT_DESKS[agentId];
    if (desk) {
      setSelectedFloor(desk.floor);
    }
    setFocusedAgent(agentId);
  }, []);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontFamily: "system-ui", fontSize: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🐾</div>
          <div>Loading building...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Title */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100,
        background: "rgba(10, 10, 20, 0.8)", backdropFilter: "blur(12px)",
        border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10, padding: "8px 20px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>🐾</span>
        <span style={{ color: "#f59e0b", fontSize: 16, fontWeight: 700, fontFamily: "system-ui" }}>Limor</span>
        <span style={{ color: "#888", fontSize: 12, fontFamily: "system-ui" }}>
          Personal Operator &bull; {agents.length} Agents &bull; 3 Floors
        </span>
      </div>

      {/* Floor selector */}
      <FloorSelector selectedFloor={selectedFloor} onSelectFloor={setSelectedFloor} />

      {/* 3D Scene */}
      <Scene
        agents={agents}
        focusedAgent={focusedAgent}
        onFocusDone={handleFocusDone}
        selectedFloor={selectedFloor}
      />

      {/* Bottom HUD */}
      <AgentHUD agents={agents} onSelectAgent={handleSelectAgent} />
    </>
  );
}
