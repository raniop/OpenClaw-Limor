"use client";

import { useRef, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FloorPlate } from "./FloorPlate";
import { BuildingFloor } from "./BuildingFloor";
import { Floor1Ground } from "./Floor1Ground";
import { Floor2Offices } from "./Floor2Offices";
import { Floor3Penthouse } from "./Floor3Penthouse";
import type { AgentData } from "./AgentCharacter";
import { AGENT_DESKS } from "../agent-config";

interface SceneProps {
  agents: AgentData[];
  focusedAgent: string | null;
  onFocusDone: () => void;
  selectedFloor: number;
}

function CameraFocus({ focusedAgent, onDone }: { focusedAgent: string | null; onDone: () => void }) {
  const { camera } = useThree();
  const targetRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (focusedAgent) {
      const desk = AGENT_DESKS[focusedAgent];
      if (desk) {
        targetRef.current = new THREE.Vector3(desk.pos[0] + 4, 12, desk.pos[2] + 12);
      }
    }
  }, [focusedAgent]);

  useFrame(() => {
    if (!targetRef.current) return;
    camera.position.lerp(targetRef.current, 0.03);
    if (camera.position.distanceTo(targetRef.current) < 0.3) {
      targetRef.current = null;
      onDone();
    }
  });

  return null;
}

export default function Scene({ agents, focusedAgent, onFocusDone, selectedFloor }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 18, 22], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#d8d4cc"]} />
      <fog attach="fog" args={["#d8d4cc", 35, 60]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[12, 18, 8]} intensity={0.7} color="#ffffff" />
      <directionalLight position={[-8, 12, -6]} intensity={0.25} color="#fff8f0" />
      <hemisphereLight args={["#ffffff", "#c8c4b8", 0.2]} />

      <OrbitControls
        target={[0, 1, 7]}
        minDistance={8}
        maxDistance={45}
        maxPolarAngle={Math.PI / 2.1}
        enableDamping
        dampingFactor={0.05}
      />

      <CameraFocus focusedAgent={focusedAgent} onDone={onFocusDone} />

      {/* Floor plate always at y=0 */}
      <FloorPlate y={0} />

      {/* Only render the selected floor - all at y=0 (bird's eye view) */}
      <BuildingFloor y={0} label="">
        {selectedFloor === 1 && <Floor1Ground />}
        {selectedFloor === 2 && <Floor2Offices agents={agents} floorY={0} />}
        {selectedFloor === 3 && <Floor3Penthouse agents={agents} />}
      </BuildingFloor>
    </Canvas>
  );
}
