"use client";

import { Html } from "@react-three/drei";
import { DoorFrame } from "./DoorFrame";
import { PlantPot, WaterCooler, Cabinet } from "./OfficeFurniture";
import { Printer, CoatRack, WallArt, WallClock, TrashCan } from "./OfficeDecor";

const H = 3;
const T = 0.12;
const WC = "#d4d0c8";

function Wall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={WC} /></mesh>;
}

function GlassWall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={size} /><meshStandardMaterial color="#a0c8e0" transparent opacity={0.2} emissive="#87CEEB" emissiveIntensity={0.08} /></mesh>
      <mesh position={[0, size[1] / 2, 0]}><boxGeometry args={[size[0], 0.04, size[2] + 0.01]} /><meshStandardMaterial color="#666" /></mesh>
      <mesh position={[0, -size[1] / 2, 0]}><boxGeometry args={[size[0], 0.04, size[2] + 0.01]} /><meshStandardMaterial color="#666" /></mesh>
    </group>
  );
}

function Label({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <Html position={position} center distanceFactor={18} style={{ pointerEvents: "none" }}>
      <div style={{ fontSize: 13, color: "#555", fontFamily: "system-ui", fontWeight: 700, background: "rgba(255,255,255,0.7)", padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>{text}</div>
    </Html>
  );
}

/** Floor 1: Lobby + Meeting Room + Break Area */
export function Floor1Ground() {
  return (
    <group>
      {/* === DIVIDER WALL: left rooms | lobby (x=-2, z=0..14) === */}
      <Wall position={[-2, H / 2, 2.5]} size={[T, H, 5]} />
      <DoorFrame position={[-2, 0, 5.5]} rotation={Math.PI / 2} />
      <Wall position={[-2, H / 2, 7]} size={[T, H, 1]} />
      {/* Meeting room glass wall */}
      <GlassWall position={[-2, H / 2, 9.5]} size={[0.06, H, 3]} />
      <DoorFrame position={[-2, 0, 11.5]} rotation={Math.PI / 2} />
      <Wall position={[-2, H / 2, 13]} size={[T, H, 2]} />

      {/* Horizontal wall separating break/meeting at z=7 */}
      <Wall position={[-6, H / 2, 7]} size={[8, H, T]} />
      <DoorFrame position={[-6, 0, 7]} rotation={0} />

      {/* === BREAK AREA (left-bottom, x:-10 to -2, z:0 to 7) === */}
      <Label position={[-6, 2.7, 0.3]} text="פינת קפה ☕" />
      {/* Floor tint */}
      <mesh position={[-6, 0.015, 3.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 7]} /><meshStandardMaterial color="#d4c8b0" transparent opacity={0.15} />
      </mesh>

      {/* Round table */}
      <mesh position={[-6, 0.55, 3.5]}><cylinderGeometry args={[0.5, 0.5, 0.04, 16]} /><meshStandardMaterial color="#5a4030" /></mesh>
      <mesh position={[-6, 0.28, 3.5]}><cylinderGeometry args={[0.06, 0.06, 0.55, 8]} /><meshStandardMaterial color="#444" /></mesh>
      {/* Stools */}
      {[[0.7, 0.4], [-0.7, 0.4], [0, -0.7], [0.7, -0.4], [-0.7, -0.4]].map(([x, z], i) => (
        <group key={i} position={[-6 + x, 0, 3.5 + z]}>
          <mesh position={[0, 0.38, 0]}><cylinderGeometry args={[0.18, 0.18, 0.04, 10]} /><meshStandardMaterial color="#2a2a3e" /></mesh>
          <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.03, 0.03, 0.36, 6]} /><meshStandardMaterial color="#444" /></mesh>
        </group>
      ))}
      {/* Coffee machine */}
      <group position={[-9, 0, 1.5]}>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.4, 1, 0.35]} /><meshStandardMaterial color="#333" /></mesh>
        <mesh position={[0.1, 0.8, 0.18]}><boxGeometry args={[0.04, 0.04, 0.02]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} /></mesh>
      </group>
      {/* Sofa */}
      <group position={[-4, 0, 1.5]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[1.8, 0.35, 0.7]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
        <mesh position={[0, 0.55, -0.3]}><boxGeometry args={[1.8, 0.3, 0.12]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
      </group>
      <PlantPot position={[-9.2, 0, 5.5]} />
      <pointLight position={[-6, 2.5, 3.5]} color="#fbbf24" intensity={0.3} distance={5} />

      {/* === MEETING ROOM (left-top, x:-10 to -2, z:7 to 14) === */}
      <Label position={[-6, 2.7, 7.3]} text="חדר ישיבות 📋" />
      <mesh position={[-6, 0.015, 10.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 7]} /><meshStandardMaterial color="#b8c4d4" transparent opacity={0.15} />
      </mesh>

      {/* Conference table */}
      <mesh position={[-6, 0.62, 10.5]}><boxGeometry args={[2.8, 0.06, 1.2]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
      {[[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]].map(([x, z], i) => (
        <mesh key={i} position={[-6 + x, 0.31, 10.5 + z]}><boxGeometry args={[0.06, 0.62, 0.06]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
      ))}
      {/* Chairs */}
      {[[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]].map(([x, z], i) => (
        <group key={i} position={[-6 + x, 0, 10.5 + z]} rotation={[0, z > 0 ? Math.PI : 0, 0]}>
          <mesh position={[0, 0.37, 0]}><boxGeometry args={[0.38, 0.04, 0.38]} /><meshStandardMaterial color="#1a1a2e" /></mesh>
          <mesh position={[0, 0.57, -0.17]}><boxGeometry args={[0.38, 0.35, 0.04]} /><meshStandardMaterial color="#1a1a2e" /></mesh>
        </group>
      ))}
      {/* Whiteboard */}
      <mesh position={[-6, 1.5, 13.5]}><boxGeometry args={[3, 1.5, 0.05]} /><meshStandardMaterial color="#f0f0f0" /></mesh>
      <mesh position={[-6, 1.5, 13.45]}><boxGeometry args={[3.1, 1.6, 0.03]} /><meshStandardMaterial color="#666" /></mesh>

      {/* === LOBBY (right side, x:-2 to 10, z:0 to 14) === */}
      <Label position={[4, 2.7, 0.3]} text="לובי קבלה" />

      {/* Reception desk */}
      <group position={[2, 0, 4]}>
        <mesh position={[0, 0.55, 0]}><boxGeometry args={[2.5, 0.06, 0.8]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
        <mesh position={[0, 0.3, -0.35]}><boxGeometry args={[2.5, 0.55, 0.08]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
        <mesh position={[-1.2, 0.3, 0]}><boxGeometry args={[0.08, 0.55, 0.8]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
        <mesh position={[1.2, 0.3, 0]}><boxGeometry args={[0.08, 0.55, 0.8]} /><meshStandardMaterial color="#3d2b1a" /></mesh>
      </group>

      {/* Waiting area sofas */}
      <group position={[6, 0, 2]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[2.2, 0.35, 0.7]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
        <mesh position={[0, 0.55, -0.3]}><boxGeometry args={[2.2, 0.3, 0.12]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
      </group>
      <group position={[6, 0, 6]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[2.2, 0.35, 0.7]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
        <mesh position={[0, 0.55, -0.3]}><boxGeometry args={[2.2, 0.3, 0.12]} /><meshStandardMaterial color="#2d3a5c" /></mesh>
      </group>

      {/* Coffee table */}
      <mesh position={[6, 0.35, 4]}><boxGeometry args={[1.2, 0.04, 0.6]} /><meshStandardMaterial color="#5a4030" /></mesh>
      {[[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[6 + x, 0.17, 4 + z]}><boxGeometry args={[0.04, 0.34, 0.04]} /><meshStandardMaterial color="#5a4030" /></mesh>
      ))}

      <PlantPot position={[8.5, 0, 1]} />
      <PlantPot position={[8.5, 0, 7]} />
      <PlantPot position={[8.5, 0, 12]} />
      <CoatRack position={[9, 0, 13]} />
      <WallClock position={[0, 2.2, 4]} />
      <WallArt position={[9.9, 1.7, 9]} color="#f59e0b" rotation={[0, -Math.PI / 2, 0]} />
      <Printer position={[0.5, 0, 10]} />
      <WaterCooler position={[0.5, 0, 8]} />

      {/* Company sign on back wall */}
      <Html position={[4, 2.2, 13.9]} center distanceFactor={20} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 18, color: "#f59e0b", fontFamily: "system-ui", fontWeight: 800, whiteSpace: "nowrap" }}>🐾 Limor</div>
      </Html>

      {/* Entrance */}
      <DoorFrame position={[4, 0, 0]} width={2} />

      {/* EXIT sign */}
      <group position={[4, 2.8, 0.1]}>
        <mesh><boxGeometry args={[0.5, 0.12, 0.04]} /><meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.4} /></mesh>
        <Html center distanceFactor={20} style={{ pointerEvents: "none" }}>
          <div style={{ fontSize: 8, color: "#fff", fontWeight: 800, fontFamily: "monospace", letterSpacing: 2 }}>EXIT</div>
        </Html>
      </group>
    </group>
  );
}
