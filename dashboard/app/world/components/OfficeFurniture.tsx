"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const DESK_COLOR = "#2a1f14";
const CHAIR_COLOR = "#1a1a2e";
const MONITOR_FRAME = "#111118";
const MONITOR_SCREEN = "#1a2940";

export function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Desktop surface */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.4, 0.06, 0.7]} />
        <meshStandardMaterial color={DESK_COLOR} />
      </mesh>
      {/* Legs */}
      {[[-0.6, 0, -0.28], [0.6, 0, -0.28], [-0.6, 0, 0.28], [0.6, 0, 0.28]].map((leg, i) => (
        <mesh key={i} position={[leg[0], 0.35, leg[2]]}>
          <boxGeometry args={[0.06, 0.7, 0.06]} />
          <meshStandardMaterial color={DESK_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

export function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
        <meshStandardMaterial color={CHAIR_COLOR} />
      </mesh>
      {/* Back rest */}
      <mesh position={[0, 0.7, -0.2]}>
        <boxGeometry args={[0.45, 0.5, 0.06]} />
        <meshStandardMaterial color={CHAIR_COLOR} />
      </mesh>
      {/* Legs */}
      {[[-0.18, 0, -0.18], [0.18, 0, -0.18], [-0.18, 0, 0.18], [0.18, 0, 0.18]].map((leg, i) => (
        <mesh key={i} position={[leg[0], 0.2, leg[2]]}>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
    </group>
  );
}

export function Monitor({ position }: { position: [number, number, number] }) {
  const screenRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (screenRef.current) {
      const mat = screenRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(clock.getElapsedTime() * 0.5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Screen */}
      <mesh ref={screenRef} position={[0, 0.22, 0]}>
        <boxGeometry args={[0.5, 0.35, 0.03]} />
        <meshStandardMaterial color={MONITOR_SCREEN} emissive={MONITOR_SCREEN} emissiveIntensity={0.3} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 0.22, -0.005]}>
        <boxGeometry args={[0.54, 0.39, 0.02]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      {/* Stand */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.08]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
      {/* Base */}
      <mesh position={[0, -0.01, 0]}>
        <boxGeometry args={[0.2, 0.02, 0.12]} />
        <meshStandardMaterial color={MONITOR_FRAME} />
      </mesh>
    </group>
  );
}

export function Keyboard({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.35, 0.02, 0.12]} />
      <meshStandardMaterial color="#222" />
    </mesh>
  );
}

/** Filing cabinet */
export function Cabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Body */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.5, 1.4, 0.4]} />
        <meshStandardMaterial color="#8a8a8a" />
      </mesh>
      {/* Drawer lines */}
      {[0.25, 0.55, 0.85, 1.15].map((y, i) => (
        <mesh key={i} position={[0, y, 0.21]}>
          <boxGeometry args={[0.42, 0.01, 0.01]} />
          <meshStandardMaterial color="#666" />
        </mesh>
      ))}
      {/* Handles */}
      {[0.35, 0.65, 0.95, 1.25].map((y, i) => (
        <mesh key={i} position={[0, y, 0.22]}>
          <boxGeometry args={[0.08, 0.02, 0.02]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      ))}
    </group>
  );
}

/** Potted plant */
export function PlantPot({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.3, 8]} />
        <meshStandardMaterial color="#8b5e3c" />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 8]} />
        <meshStandardMaterial color="#3a2a1a" />
      </mesh>
      {/* Bush / leaves */}
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.22, 8, 6]} />
        <meshStandardMaterial color="#3a8a3a" />
      </mesh>
      <mesh position={[0.08, 0.68, 0.05]}>
        <sphereGeometry args={[0.14, 6, 5]} />
        <meshStandardMaterial color="#2d7a2d" />
      </mesh>
    </group>
  );
}

/** Water cooler */
export function WaterCooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.3, 0.8, 0.3]} />
        <meshStandardMaterial color="#e0e0e0" />
      </mesh>
      {/* Water jug */}
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.3, 8]} />
        <meshStandardMaterial color="#b8d8f0" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/** Full desk setup: desk + chair + monitor + keyboard */
export function DeskSetup({
  position,
  facingAngle = 0,
}: {
  position: [number, number, number];
  facingAngle?: number;
}) {
  return (
    <group position={position} rotation={[0, facingAngle, 0]}>
      <Desk position={[0, 0, 0]} />
      <Chair position={[0, 0, 0.55]} rotation={Math.PI} />
      <Monitor position={[0, 0.73, -0.15]} />
      <Keyboard position={[0, 0.73, 0.1]} />
    </group>
  );
}
