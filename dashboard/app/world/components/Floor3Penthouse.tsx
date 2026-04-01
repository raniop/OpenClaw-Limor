"use client";

import { Html } from "@react-three/drei";
import { CommandCenter } from "./CommandCenter";
import { ServerRoom } from "./ServerRoom";
import { GymRoom } from "./GymRoom";
import { GameRoom } from "./GameRoom";
import { AgentCharacter, type AgentData } from "./AgentCharacter";
import { AGENT_COLORS, AGENT_DESKS } from "../agent-config";

const H = 3;
const T = 0.12;
const WC = "#d4d0c8";

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={WC} /></mesh>;
}

interface Floor3Props {
  agents: AgentData[];
}

export function Floor3Penthouse({ agents }: Floor3Props) {
  const limor = agents.find((a) => a.id === "limor");

  return (
    <group>
      {/* Cross walls dividing into 4 quadrants */}
      {/* Vertical divider at x=0 */}
      <Wall position={[0, H / 2, 3.5]} size={[T, H, 7]} />
      <Wall position={[0, H / 2, 10.5]} size={[T, H, 7]} />

      {/* Horizontal divider at z=7 */}
      <Wall position={[-5, H / 2, 7]} size={[10, H, T]} />
      <Wall position={[5, H / 2, 7]} size={[10, H, T]} />

      {/* === SERVER ROOM (top-left, x:-10 to 0, z:7 to 14) === */}
      <ServerRoom position={[-5, 0, 10.5]} />

      {/* === LIMOR'S OFFICE (top-right, x:0 to 10, z:7 to 14) === */}
      <CommandCenter position={[5, 0, 10.5]} />
      {limor && (
        <AgentCharacter
          agent={limor}
          color={AGENT_COLORS.limor}
          homePos={[AGENT_DESKS.limor.pos[0], 0, AGENT_DESKS.limor.pos[2]]}
          isOrchestrator
        />
      )}

      {/* === GYM (bottom-left, x:-10 to 0, z:0 to 7) === */}
      <GymRoom position={[-5, 0, 3.5]} />

      {/* === GAME ROOM (bottom-right, x:0 to 10, z:0 to 7) === */}
      <GameRoom position={[5, 0, 3.5]} />
    </group>
  );
}
