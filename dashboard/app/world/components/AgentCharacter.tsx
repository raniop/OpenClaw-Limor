"use client";

import { useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { VoxelCharacter } from "./VoxelCharacter";
import { initBehavior, updateBehavior, type BehaviorState } from "./AgentBehavior";

export interface AgentData {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  role: string;
}

interface AgentCharacterProps {
  agent: AgentData;
  color: string;
  homePos: [number, number, number];
  isOrchestrator?: boolean;
}

export function AgentCharacter({ agent, color, homePos, isOrchestrator = false }: AgentCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [behavior, setBehavior] = useState<BehaviorState>(() =>
    initBehavior(homePos, isOrchestrator)
  );
  const behaviorRef = useRef(behavior);

  const updateRef = useCallback(() => {
    behaviorRef.current = behavior;
  }, [behavior]);
  updateRef();

  useFrame((_, delta) => {
    // Clamp delta to avoid jumps on tab switch
    const d = Math.min(delta, 0.1);
    const current = behaviorRef.current;
    const next = updateBehavior(current, d, isOrchestrator);

    // Only trigger re-render if anim state changed
    if (next.anim !== current.anim) {
      setBehavior(next);
    }
    behaviorRef.current = next;

    // Update group transform directly (no re-render needed)
    if (groupRef.current) {
      // Lower Y when typing/sitting at desk
      const sittingY = (next.anim === "typing") ? -0.25 : 0;
      groupRef.current.position.set(next.position[0], next.position[1] + sittingY, next.position[2]);
      groupRef.current.rotation.y = next.rotation;
    }
  });

  return (
    <group ref={groupRef} position={homePos}>
      {/* The voxel character */}
      <VoxelCharacter
        color={color}
        animState={behavior.anim}
        isOrchestrator={isOrchestrator}
      />

      {/* Floating name label */}
      <Html
        position={[0, 2.2, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            background: "rgba(10, 10, 20, 0.85)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${isOrchestrator ? "#f59e0b" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 6,
            padding: "4px 10px",
            textAlign: "center",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          <div style={{
            color: isOrchestrator ? "#f59e0b" : "#e0e0e0",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "system-ui, sans-serif",
          }}>
            {agent.emoji} {agent.name}
          </div>
          <div style={{
            color: "#888",
            fontSize: 10,
            fontFamily: "system-ui, sans-serif",
          }}>
            {agent.role}
          </div>
        </div>
      </Html>

      {/* Small point light matching agent color */}
      <pointLight position={[0, 1, 0]} color={color} intensity={0.15} distance={3} />
    </group>
  );
}
