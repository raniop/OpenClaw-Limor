"use client";

import { Html } from "@react-three/drei";
import { DoorFrame } from "./DoorFrame";
import { DeskSetup, Cabinet, PlantPot } from "./OfficeFurniture";
import { TrashCan, WallArt, WallClock } from "./OfficeDecor";
import { AgentCharacter, type AgentData } from "./AgentCharacter";
import { AGENT_COLORS, AGENT_DESKS, OFFICE_PAIRS } from "../agent-config";

const H = 3;
const T = 0.12;
const WC = "#d4d0c8";

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={WC} /></mesh>;
}

function Nameplate({ position, text, rotation = 0 }: { position: [number, number, number]; text: string; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh><boxGeometry args={[0.8, 0.2, 0.03]} /><meshStandardMaterial color="#2a2520" /></mesh>
      <Html center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 9, color: "#f0e8d8", fontFamily: "system-ui", fontWeight: 600, whiteSpace: "nowrap" }}>{text}</div>
      </Html>
    </group>
  );
}

interface Floor2Props {
  agents: AgentData[];
  floorY: number;
}

export function Floor2Offices({ agents, floorY }: Floor2Props) {
  // Office layout: x=-10 to 10, z=0 to 14
  // Left column: x=-10 to -5 (2 offices)
  // Left-center: x=-5 to -1 (2 offices)
  // Hallway: x=-1 to 1
  // Right-center: x=1 to 5 (2 offices)
  // Right column: x=5 to 10 (2 offices, top row only + open area)

  // Hallway walls (x=-1 and x=1, full length with door gaps)
  const leftDoorZs = [3.5, 10.5];   // doors to left-center offices
  const rightDoorZs = [3.5, 10.5];  // doors to right-center offices

  // Office row configs: [agentA, agentB, xCenter, zCenter, label]
  const offices: { a: string; b: string; cx: number; cz: number; label: string; doorX: number; doorZ: number }[] = [
    // Top row (z=7..14)
    { a: "boris", b: "yuri", cx: -7.5, cz: 10.5, label: "בוריס + יורי 🔧💻", doorX: -5, doorZ: 10.5 },
    { a: "michal", b: "ronit", cx: -3, cz: 10.5, label: "מיכל + רונית 👁️🔍", doorX: -1, doorZ: 10.5 },
    { a: "noa", b: "yael", cx: 3, cz: 10.5, label: "נועה + יעל 📊⚡", doorX: 1, doorZ: 10.5 },
    { a: "nimrod", b: "amit", cx: 7.5, cz: 10.5, label: "נמרוד + עמית 🔐📦", doorX: 5, doorZ: 10.5 },
    // Bottom row (z=0..7)
    { a: "tal", b: "maya", cx: -7.5, cz: 3.5, label: "טל + מאיה 🛡️🏠", doorX: -5, doorZ: 3.5 },
    { a: "adi", b: "dana", cx: -3, cz: 3.5, label: "עדי + דנה 📅🛒", doorX: -1, doorZ: 3.5 },
    { a: "alma", b: "hila", cx: 3, cz: 3.5, label: "אלמה + הילה 🌸🍽️", doorX: 1, doorZ: 3.5 },
  ];

  return (
    <group>
      {/* === HALLWAY WALLS === */}

      {/* Left hallway wall (x=-1) */}
      <Wall position={[-1, H / 2, 1.5]} size={[T, H, 3]} />
      <DoorFrame position={[-1, 0, 3.5]} rotation={Math.PI / 2} />
      <Wall position={[-1, H / 2, 5.5]} size={[T, H, 2.5]} />
      <Wall position={[-1, H / 2, 7]} size={[T, H, 0.5]} />
      <DoorFrame position={[-1, 0, 10.5]} rotation={Math.PI / 2} />
      <Wall position={[-1, H / 2, 8.5]} size={[T, H, 2.5]} />
      <Wall position={[-1, H / 2, 12.5]} size={[T, H, 3]} />

      {/* Right hallway wall (x=1) */}
      <Wall position={[1, H / 2, 1.5]} size={[T, H, 3]} />
      <DoorFrame position={[1, 0, 3.5]} rotation={Math.PI / 2} />
      <Wall position={[1, H / 2, 5.5]} size={[T, H, 2.5]} />
      <Wall position={[1, H / 2, 7]} size={[T, H, 0.5]} />
      <DoorFrame position={[1, 0, 10.5]} rotation={Math.PI / 2} />
      <Wall position={[1, H / 2, 8.5]} size={[T, H, 2.5]} />
      <Wall position={[1, H / 2, 12.5]} size={[T, H, 3]} />

      {/* === COLUMN DIVIDERS === */}

      {/* x=-5: separates left-column from left-center offices */}
      <Wall position={[-5, H / 2, 1.5]} size={[T, H, 3]} />
      <DoorFrame position={[-5, 0, 3.5]} rotation={Math.PI / 2} />
      <Wall position={[-5, H / 2, 5.5]} size={[T, H, 2.5]} />
      <Wall position={[-5, H / 2, 7]} size={[T, H, 0.5]} />
      <DoorFrame position={[-5, 0, 10.5]} rotation={Math.PI / 2} />
      <Wall position={[-5, H / 2, 8.5]} size={[T, H, 2.5]} />
      <Wall position={[-5, H / 2, 12.5]} size={[T, H, 3]} />

      {/* x=5: separates right-center from right-column offices */}
      <Wall position={[5, H / 2, 1.5]} size={[T, H, 3]} />
      <DoorFrame position={[5, 0, 3.5]} rotation={Math.PI / 2} />
      <Wall position={[5, H / 2, 5.5]} size={[T, H, 2.5]} />
      <Wall position={[5, H / 2, 7]} size={[T, H, 0.5]} />
      <DoorFrame position={[5, 0, 10.5]} rotation={Math.PI / 2} />
      <Wall position={[5, H / 2, 8.5]} size={[T, H, 2.5]} />
      <Wall position={[5, H / 2, 12.5]} size={[T, H, 3]} />

      {/* === ROW DIVIDER at z=7 === */}
      {[[-7.5, 5], [-3, 4], [3, 4], [7.5, 5]].map(([cx, w], i) => (
        <Wall key={i} position={[cx, H / 2, 7]} size={[w, H, T]} />
      ))}

      {/* Open area sign (bottom-right, no office) */}
      <Html position={[7.5, 2.5, 3.5]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 12, color: "#888", fontFamily: "system-ui", fontWeight: 600, background: "rgba(255,255,255,0.5)", padding: "2px 8px", borderRadius: 4 }}>
          אזור ישיבה 🛋️
        </div>
      </Html>
      {/* Small sofa in open area */}
      <group position={[7.5, 0, 3]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[2, 0.35, 0.7]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
        <mesh position={[0, 0.55, -0.3]}><boxGeometry args={[2, 0.3, 0.12]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
      </group>
      <PlantPot position={[9, 0, 5]} />

      {/* === OFFICE DESKS + FURNITURE + AGENTS === */}
      {offices.map((office) => {
        const agentA = agents.find((a) => a.id === office.a);
        const agentB = agents.find((a) => a.id === office.b);
        const deskA = AGENT_DESKS[office.a];
        const deskB = AGENT_DESKS[office.b];

        return (
          <group key={office.a}>
            {/* Nameplate */}
            <Nameplate
              position={[office.doorX + (office.doorX < 0 ? 0.15 : -0.15), 2, office.doorZ]}
              text={office.label}
              rotation={office.doorX < 0 ? -Math.PI / 2 : Math.PI / 2}
            />

            {/* Desks */}
            {deskA && <DeskSetup position={[deskA.pos[0], 0, deskA.pos[2]]} />}
            {deskB && <DeskSetup position={[deskB.pos[0], 0, deskB.pos[2]]} />}

            {/* Cabinet */}
            <Cabinet position={[office.cx + 1.5, 0, office.cz + 2.5]} />

            {/* Plant */}
            <PlantPot position={[office.cx - 1.5, 0, office.cz + 2.5]} />

            {/* Trash */}
            <TrashCan position={[office.cx + 1.5, 0, office.cz - 1.5]} />

            {/* Agents */}
            {agentA && deskA && (
              <AgentCharacter
                agent={agentA}
                color={AGENT_COLORS[agentA.id] || "#888"}
                homePos={[deskA.pos[0], 0, deskA.pos[2] + 0.55]}
                isOrchestrator={false}
              />
            )}
            {agentB && deskB && (
              <AgentCharacter
                agent={agentB}
                color={AGENT_COLORS[agentB.id] || "#888"}
                homePos={[deskB.pos[0], 0, deskB.pos[2] + 0.55]}
                isOrchestrator={false}
              />
            )}
          </group>
        );
      })}

      {/* Hallway decor */}
      <WallClock position={[-0.94, 2.2, 7]} />
      <WallArt position={[-0.94, 1.6, 5]} color="#3b82f6" />
      <WallArt position={[0.94, 1.6, 9]} color="#f59e0b" rotation={[0, Math.PI, 0]} />
      <PlantPot position={[0, 0, 13]} />
      <PlantPot position={[0, 0, 1]} />
    </group>
  );
}
