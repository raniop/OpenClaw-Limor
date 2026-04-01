"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";

/** Office printer */
export function Printer({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Main body */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[0.6, 0.35, 0.5]} />
        <meshStandardMaterial color="#d0d0d0" />
      </mesh>
      {/* Top surface / scanner */}
      <mesh position={[0, 0.63, 0]}>
        <boxGeometry args={[0.62, 0.02, 0.52]} />
        <meshStandardMaterial color="#bbb" />
      </mesh>
      {/* Paper tray */}
      <mesh position={[0, 0.28, 0.28]}>
        <boxGeometry args={[0.4, 0.02, 0.2]} />
        <meshStandardMaterial color="#eee" />
      </mesh>
      {/* Display */}
      <mesh position={[0.2, 0.55, 0.26]}>
        <boxGeometry args={[0.12, 0.06, 0.02]} />
        <meshStandardMaterial color="#0a2040" emissive="#22c55e" emissiveIntensity={0.2} />
      </mesh>
      {/* Stand/table */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.5, 0.3, 0.4]} />
        <meshStandardMaterial color="#888" />
      </mesh>
    </group>
  );
}

/** Small trash can */
export function TrashCan({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.18, position[2]]}>
      <cylinderGeometry args={[0.1, 0.08, 0.35, 8]} />
      <meshStandardMaterial color="#444" />
    </mesh>
  );
}

/** Exit sign - glowing red box above doorway */
export function ExitSign({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.4, 0.12, 0.04]} />
        <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.4} />
      </mesh>
      <Html center distanceFactor={20} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 8, color: "#fff", fontWeight: 800, fontFamily: "system-ui", letterSpacing: 2 }}>
          EXIT
        </div>
      </Html>
    </group>
  );
}

/** Wall clock with moving hands */
export function WallClock({ position }: { position: [number, number, number] }) {
  const minuteRef = useRef<THREE.Mesh>(null);
  const hourRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (minuteRef.current) minuteRef.current.rotation.z = -t * 0.1;
    if (hourRef.current) hourRef.current.rotation.z = -t * 0.008;
  });

  return (
    <group position={position}>
      {/* Clock face */}
      <mesh>
        <circleGeometry args={[0.2, 24]} />
        <meshStandardMaterial color="#f8f8f0" />
      </mesh>
      {/* Rim */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[0.19, 0.22, 24]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      {/* Minute hand */}
      <mesh ref={minuteRef} position={[0, 0.07, 0.01]}>
        <boxGeometry args={[0.01, 0.14, 0.01]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Hour hand */}
      <mesh ref={hourRef} position={[0, 0.045, 0.01]}>
        <boxGeometry args={[0.015, 0.09, 0.01]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Center dot */}
      <mesh position={[0, 0, 0.02]}>
        <sphereGeometry args={[0.015, 8, 6]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}

/** Abstract wall art poster */
export function WallArt({
  position,
  color,
  rotation = [0, 0, 0],
}: {
  position: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[0.65, 0.85, 0.03]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Art */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[0.55, 0.75, 0.01]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Abstract shape on art */}
      <mesh position={[0.05, 0.05, 0.035]}>
        <circleGeometry args={[0.15, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/** Coat rack */
export function CoatRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.7, 6]} />
        <meshStandardMaterial color="#5a4030" />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.04, 8]} />
        <meshStandardMaterial color="#5a4030" />
      </mesh>
      {/* Hooks */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 0.08, 1.6, Math.sin(angle) * 0.08]}
        >
          <boxGeometry args={[0.04, 0.04, 0.1]} />
          <meshStandardMaterial color="#5a4030" />
        </mesh>
      ))}
    </group>
  );
}
