"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export function CommandCenter({ position }: { position: [number, number, number] }) {
  const screen1Ref = useRef<THREE.Mesh>(null);
  const screen2Ref = useRef<THREE.Mesh>(null);
  const screen3Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    [screen1Ref, screen2Ref, screen3Ref].forEach((ref, i) => {
      if (ref.current) {
        const mat = ref.current.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + Math.sin(t * 0.8 + i * 2) * 0.2;
      }
    });
  });

  return (
    <group position={position}>
      {/* ========== MANAGER'S DESK (large, dark wood) ========== */}
      {/* Desktop - larger than regular */}
      <mesh position={[0, 0.72, 0.5]}>
        <boxGeometry args={[2.2, 0.08, 0.9]} />
        <meshStandardMaterial color="#3d2b1a" />
      </mesh>
      {/* Desk front panel */}
      <mesh position={[0, 0.4, 0.1]}>
        <boxGeometry args={[2.2, 0.65, 0.06]} />
        <meshStandardMaterial color="#3d2b1a" />
      </mesh>
      {/* Desk side panels */}
      <mesh position={[-1.05, 0.4, 0.5]}>
        <boxGeometry args={[0.06, 0.65, 0.9]} />
        <meshStandardMaterial color="#3d2b1a" />
      </mesh>
      <mesh position={[1.05, 0.4, 0.5]}>
        <boxGeometry args={[0.06, 0.65, 0.9]} />
        <meshStandardMaterial color="#3d2b1a" />
      </mesh>

      {/* ========== EXECUTIVE CHAIR ========== */}
      <group position={[0, 0, 1.2]}>
        {/* Seat */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.55, 0.08, 0.5]} />
          <meshStandardMaterial color="#1a1a28" />
        </mesh>
        {/* High backrest */}
        <mesh position={[0, 0.85, -0.22]}>
          <boxGeometry args={[0.55, 0.65, 0.08]} />
          <meshStandardMaterial color="#1a1a28" />
        </mesh>
        {/* Armrests */}
        <mesh position={[-0.3, 0.58, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.35]} />
          <meshStandardMaterial color="#1a1a28" />
        </mesh>
        <mesh position={[0.3, 0.58, 0]}>
          <boxGeometry args={[0.06, 0.04, 0.35]} />
          <meshStandardMaterial color="#1a1a28" />
        </mesh>
        {/* Base */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.04, 12]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.28, 6]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      </group>

      {/* ========== MONITORS ON DESK ========== */}
      {/* Dual monitors */}
      <mesh position={[-0.4, 1.0, 0.2]}>
        <boxGeometry args={[0.55, 0.38, 0.03]} />
        <meshStandardMaterial color="#0a1628" emissive="#1e40af" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.4, 1.0, 0.2]}>
        <boxGeometry args={[0.55, 0.38, 0.03]} />
        <meshStandardMaterial color="#0a1628" emissive="#7c3aed" emissiveIntensity={0.3} />
      </mesh>

      {/* ========== WALL SCREENS (dashboard displays) ========== */}
      <group position={[0, 2.0, -2.5]}>
        <mesh ref={screen1Ref}>
          <boxGeometry args={[2.2, 1.2, 0.05]} />
          <meshStandardMaterial color="#0a1628" emissive="#1e40af" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[2.3, 1.3, 0.03]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      <group position={[-2, 1.8, -2.2]} rotation={[0, 0.3, 0]}>
        <mesh ref={screen2Ref}>
          <boxGeometry args={[1.2, 0.8, 0.05]} />
          <meshStandardMaterial color="#0a1628" emissive="#059669" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[1.3, 0.9, 0.03]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      <group position={[2, 1.8, -2.2]} rotation={[0, -0.3, 0]}>
        <mesh ref={screen3Ref}>
          <boxGeometry args={[1.2, 0.8, 0.05]} />
          <meshStandardMaterial color="#0a1628" emissive="#f59e0b" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[1.3, 0.9, 0.03]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      {/* ========== BOOKSHELF ========== */}
      <group position={[-2.8, 0, -1]}>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[0.8, 1.8, 0.35]} />
          <meshStandardMaterial color="#4a3520" />
        </mesh>
        {/* Books (colored blocks) */}
        {[0.25, 0.55, 0.85, 1.15, 1.45].map((y, i) => (
          <mesh key={i} position={[0, y, 0.05]}>
            <boxGeometry args={[0.65, 0.18, 0.22]} />
            <meshStandardMaterial color={["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed"][i]} />
          </mesh>
        ))}
      </group>

      {/* ========== FLOOR - premium carpet ========== */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 7]} />
        <meshStandardMaterial color="#2a1f30" transparent opacity={0.25} />
      </mesh>

      {/* ========== NAMEPLATE on desk ========== */}
      <group position={[0, 0.78, 0.05]}>
        <mesh>
          <boxGeometry args={[0.5, 0.12, 0.06]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.3} />
        </mesh>
        <Html center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div style={{ fontSize: 8, color: "#1a1520", fontWeight: 800, fontFamily: "system-ui" }}>
            לימור 🐾 מנהלת
          </div>
        </Html>
      </group>

      {/* ========== VISITOR CHAIRS ========== */}
      {[-0.6, 0.6].map((x, i) => (
        <group key={i} position={[x, 0, -0.8]}>
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[0.4, 0.05, 0.4]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[0, 0.6, 0.18]}>
            <boxGeometry args={[0.4, 0.4, 0.05]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
        </group>
      ))}

      {/* Lighting */}
      <pointLight position={[0, 2.5, 0]} color="#f5f0e0" intensity={0.5} distance={6} />
    </group>
  );
}
