"use client";

import { Html } from "@react-three/drei";
import { DoorFrame } from "./DoorFrame";
import { OFFICE_PAIRS } from "../agent-config";

const H = 3;
const T = 0.12;
const WC = "#d4d0c8";

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={WC} /></mesh>;
}

function GlassWall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={size} /><meshStandardMaterial color="#a0c8e0" transparent opacity={0.2} emissive="#87CEEB" emissiveIntensity={0.08} roughness={0.05} /></mesh>
      <mesh position={[0, size[1] / 2, 0]}><boxGeometry args={[size[0], 0.04, size[2] + 0.01]} /><meshStandardMaterial color="#666" /></mesh>
      <mesh position={[0, -size[1] / 2, 0]}><boxGeometry args={[size[0], 0.04, size[2] + 0.01]} /><meshStandardMaterial color="#666" /></mesh>
    </group>
  );
}

function WindowPanel({ position, width, rotation = [0, 0, 0] }: { position: [number, number, number]; width: number; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.4, 0]}><boxGeometry args={[width, 0.8, T]} /><meshStandardMaterial color={WC} /></mesh>
      <mesh position={[0, 0.82, 0.06]}><boxGeometry args={[width + 0.05, 0.03, 0.12]} /><meshStandardMaterial color="#bbb" /></mesh>
      <mesh position={[0, 2.7, 0]}><boxGeometry args={[width, 0.6, T]} /><meshStandardMaterial color={WC} /></mesh>
      <mesh position={[0, 1.6, 0]}><boxGeometry args={[width - 0.1, 1.5, 0.04]} /><meshStandardMaterial color="#a8d4f0" transparent opacity={0.3} emissive="#87CEEB" emissiveIntensity={0.12} roughness={0.02} /></mesh>
      <mesh position={[0, 1.6, 0.025]}><boxGeometry args={[0.03, 1.5, 0.02]} /><meshStandardMaterial color="#888" /></mesh>
      <mesh position={[0, 1.6, 0.025]}><boxGeometry args={[width - 0.1, 0.03, 0.02]} /><meshStandardMaterial color="#888" /></mesh>
    </group>
  );
}

function Nameplate({ position, text, rotation = 0 }: { position: [number, number, number]; text: string; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh><boxGeometry args={[0.7, 0.2, 0.03]} /><meshStandardMaterial color="#2a2520" /></mesh>
      <Html center distanceFactor={14} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 10, color: "#f0e8d8", fontFamily: "system-ui", fontWeight: 600, whiteSpace: "nowrap" }}>{text}</div>
      </Html>
    </group>
  );
}

function RoomLabel({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center distanceFactor={20} style={{ pointerEvents: "none" }}>
      <div style={{ fontSize: 14, color: "#555", fontFamily: "system-ui", fontWeight: 700, background: "rgba(255,255,255,0.7)", padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>{text}</div>
    </Html>
  );
}

// Helper: vertical wall along x-axis with door openings
// wallX: x position of the wall
// zStart, zEnd: z range
// doorZs: z positions for door openings (each door ~1.5 wide)
function WallWithDoors({ wallX, zStart, zEnd, doorZs, facesRight }: {
  wallX: number; zStart: number; zEnd: number; doorZs: number[]; facesRight?: boolean;
}) {
  const segments: React.ReactNode[] = [];
  const sorted = [...doorZs].sort((a, b) => a - b);
  const doorHalf = 0.75;

  let cursor = zStart;
  sorted.forEach((dz, i) => {
    const gapStart = dz - doorHalf;
    const gapEnd = dz + doorHalf;
    if (cursor < gapStart) {
      const len = gapStart - cursor;
      segments.push(
        <Wall key={`seg-${i}-a`} position={[wallX, H / 2, cursor + len / 2]} size={[T, H, len]} />
      );
    }
    // Door frame
    segments.push(
      <DoorFrame key={`door-${i}`} position={[wallX, 0, dz]} rotation={Math.PI / 2} width={1.3} />
    );
    cursor = gapEnd;
  });
  // Final segment
  if (cursor < zEnd) {
    const len = zEnd - cursor;
    segments.push(
      <Wall key="seg-final" position={[wallX, H / 2, cursor + len / 2]} size={[T, H, len]} />
    );
  }

  return <>{segments}</>;
}

export function OfficeWalls() {
  // Row boundaries: z = -10, -4, 2, 8, 14
  const rowLines = [-4, 2, 8];

  return (
    <group>
      {/* ============ OUTER WALLS ============ */}

      {/* BACK (z=14) */}
      <Wall position={[-9, H / 2, 14]} size={[14, H, T]} />
      <Wall position={[9, H / 2, 14]} size={[14, H, T]} />
      {/* Entrance at back */}
      <DoorFrame position={[0, 0, 14]} width={1.8} />

      {/* FRONT (z=-10) - windows */}
      <Wall position={[-14, H / 2, -10]} size={[4, H, T]} />
      <WindowPanel position={[-10.5, 0, -10]} width={3} />
      <Wall position={[-7.5, H / 2, -10]} size={[3, H, T]} />
      <WindowPanel position={[-4.5, 0, -10]} width={3} />
      <Wall position={[-1.5, H / 2, -10]} size={[3, H, T]} />
      <WindowPanel position={[1.5, 0, -10]} width={3} />
      <Wall position={[4.5, H / 2, -10]} size={[3, H, T]} />
      <WindowPanel position={[7.5, 0, -10]} width={3} />
      <Wall position={[10.5, H / 2, -10]} size={[3, H, T]} />
      <Wall position={[14, H / 2, -10]} size={[4, H, T]} />

      {/* LEFT (x=-16) - windows */}
      <Wall position={[-16, H / 2, -5]} size={[T, H, 10]} />
      <WindowPanel position={[-16, 0, 2]} width={4} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[-16, H / 2, 6]} size={[T, H, 4]} />
      <WindowPanel position={[-16, 0, 10]} width={4} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[-16, H / 2, 13]} size={[T, H, 2]} />

      {/* RIGHT (x=16) - windows */}
      <Wall position={[16, H / 2, -5]} size={[T, H, 10]} />
      <WindowPanel position={[16, 0, 2]} width={4} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[16, H / 2, 6]} size={[T, H, 4]} />
      <WindowPanel position={[16, 0, 10]} width={4} rotation={[0, Math.PI / 2, 0]} />
      <Wall position={[16, H / 2, 13]} size={[T, H, 2]} />

      {/* ============ INTERIOR CORRIDOR WALLS ============ */}

      {/* x=-9: Left offices ↔ Side rooms (doors at z=11, 5, -1) */}
      <WallWithDoors wallX={-9} zStart={-10} zEnd={14} doorZs={[11, 5, -1, -7]} />

      {/* x=-3: Left offices ↔ Hallway (doors at z=11, 5, -1, -7) */}
      <WallWithDoors wallX={-3} zStart={-10} zEnd={14} doorZs={[11, 5, -1, -7]} />

      {/* x=3: Hallway ↔ Right offices (doors at z=11, 5, -1) */}
      <WallWithDoors wallX={3} zStart={-10} zEnd={14} doorZs={[11, 5, -1]} />

      {/* x=9: Right offices ↔ Side rooms (doors at z=11, 5, -1) */}
      <WallWithDoors wallX={9} zStart={-10} zEnd={14} doorZs={[11, 5, -1]} />

      {/* ============ HORIZONTAL ROW WALLS ============ */}
      {rowLines.map((z) => (
        <group key={z}>
          {/* Left side room */}
          <Wall position={[-12.5, H / 2, z]} size={[7, H, T]} />
          {/* Left office */}
          <Wall position={[-6, H / 2, z]} size={[6, H, T]} />
          {/* Right office */}
          <Wall position={[6, H / 2, z]} size={[6, H, T]} />
          {/* Right side room */}
          <Wall position={[12.5, H / 2, z]} size={[7, H, T]} />
        </group>
      ))}

      {/* Bottom row wall at z=-4 for right side (no office there, just wall) */}
      {/* Right side has no office in bottom row - make it hallway extension */}

      {/* ============ MEETING ROOM GLASS WALL ============ */}
      {/* Replace the solid wall for meeting room front (x=9, z=-4 to 2) with glass */}
      {/* Already handled by WallWithDoors but let's add glass accent on hallway side */}
      <GlassWall position={[3, H / 2, -1]} size={[0.06, H, 4]} />

      {/* ============ OFFICE NAMEPLATES ============ */}
      {OFFICE_PAIRS.map((office) => {
        const isLeft = office.doorPos[0] < 0;
        return (
          <Nameplate
            key={office.id}
            position={[office.doorPos[0] + (isLeft ? 0.2 : -0.2), 2, office.doorPos[2]]}
            text={`${office.emoji} ${office.names}`}
            rotation={isLeft ? -Math.PI / 2 : Math.PI / 2}
          />
        );
      })}

      {/* ============ ROOM LABELS ============ */}
      <RoomLabel position={[-12.5, 2.7, 8.3]} text="חדר שרתים 🖥️" />
      <RoomLabel position={[-12.5, 2.7, 2.3]} text="חדר כושר 🏋️" />
      <RoomLabel position={[-12.5, 2.7, -3.7]} text="פינת קפה ☕" />
      <RoomLabel position={[12.5, 2.7, 8.3]} text="משרד מנהלת 🐾" />
      <RoomLabel position={[12.5, 2.7, 2.3]} text="חדר משחקים 🎮" />
      <RoomLabel position={[12.5, 2.7, -3.7]} text="חדר ישיבות 📋" />

      {/* ============ EXIT SIGN ============ */}
      <group position={[0, 2.8, 13.9]}>
        <mesh><boxGeometry args={[0.5, 0.12, 0.04]} /><meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.4} /></mesh>
        <Html center distanceFactor={20} style={{ pointerEvents: "none" }}>
          <div style={{ fontSize: 8, color: "#fff", fontWeight: 800, fontFamily: "monospace", letterSpacing: 2 }}>EXIT</div>
        </Html>
      </group>

      {/* Sunlight from windows */}
      <directionalLight position={[0, 5, -18]} intensity={0.25} color="#ffe8c0" />
      <directionalLight position={[-20, 5, 0]} intensity={0.15} color="#ffe8c0" />
    </group>
  );
}
