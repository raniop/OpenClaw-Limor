"use client";

import { Html } from "@react-three/drei";

const H = 3;
const T = 0.12;
const WC = "#d4d0c8";

interface BuildingFloorProps {
  y: number;
  children: React.ReactNode;
  label?: string;
}

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={WC} /></mesh>;
}

function WindowPanel({ position, width, rotation = [0, 0, 0] }: { position: [number, number, number]; width: number; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.4, 0]}><boxGeometry args={[width, 0.8, T]} /><meshStandardMaterial color={WC} /></mesh>
      <mesh position={[0, 2.7, 0]}><boxGeometry args={[width, 0.6, T]} /><meshStandardMaterial color={WC} /></mesh>
      <mesh position={[0, 1.6, 0]}><boxGeometry args={[width - 0.1, 1.5, 0.04]} /><meshStandardMaterial color="#a8d4f0" transparent opacity={0.3} emissive="#87CEEB" emissiveIntensity={0.1} /></mesh>
      <mesh position={[0, 1.6, 0.02]}><boxGeometry args={[0.03, 1.5, 0.02]} /><meshStandardMaterial color="#888" /></mesh>
      <mesh position={[0, 1.6, 0.02]}><boxGeometry args={[width - 0.1, 0.03, 0.02]} /><meshStandardMaterial color="#888" /></mesh>
    </group>
  );
}

/** Outer walls for one floor (3 sides - front open for cutaway view) */
export function BuildingFloor({ y, children, label }: BuildingFloorProps) {
  // Building: x: -10 to 10, z: 0 to 14
  return (
    <group position={[0, y, 0]}>
      {/* BACK WALL (z=14) */}
      <Wall position={[-5, H / 2, 14]} size={[10, H, T]} />
      <Wall position={[5, H / 2, 14]} size={[10, H, T]} />

      {/* LEFT WALL (x=-10) with windows */}
      <Wall position={[-10, H / 2, 2]} size={[T, H, 4]} />
      <WindowPanel position={[-10, 0, 5.5]} width={3} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[-10, H / 2, 8.5]} size={[T, H, 3]} />
      <WindowPanel position={[-10, 0, 11.5]} width={3} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[-10, H / 2, 13.5]} size={[T, H, 1]} />

      {/* RIGHT WALL (x=10) with windows */}
      <Wall position={[10, H / 2, 2]} size={[T, H, 4]} />
      <WindowPanel position={[10, 0, 5.5]} width={3} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[10, H / 2, 8.5]} size={[T, H, 3]} />
      <WindowPanel position={[10, 0, 11.5]} width={3} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[10, H / 2, 13.5]} size={[T, H, 1]} />

      {/* FRONT WALL (z=0) - LOW wall / half-height for cutaway visibility */}
      <Wall position={[0, 0.4, 0]} size={[20, 0.8, T]} />

      {/* Ceiling light panels */}
      {[[-5, 3.5], [5, 3.5], [-5, 10.5], [5, 10.5]].map(([x, z], i) => (
        <group key={i} position={[x, 2.95, z]}>
          <mesh><boxGeometry args={[1.2, 0.06, 0.4]} /><meshStandardMaterial color="#e0e0e0" /></mesh>
          <mesh position={[0, -0.04, 0]}><boxGeometry args={[1.0, 0.02, 0.3]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.6} /></mesh>
          <pointLight position={[0, -0.2, 0]} intensity={0.3} distance={6} color="#f5f0e8" />
        </group>
      ))}

      {/* Floor label on side */}
      {label && (
        <Html position={[-10.5, 1.5, 7]} center distanceFactor={25} style={{ pointerEvents: "none" }}>
          <div style={{ fontSize: 12, color: "#888", fontFamily: "system-ui", fontWeight: 700, background: "rgba(255,255,255,0.8)", padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
            {label}
          </div>
        </Html>
      )}

      {/* Children (room content) */}
      {children}
    </group>
  );
}
