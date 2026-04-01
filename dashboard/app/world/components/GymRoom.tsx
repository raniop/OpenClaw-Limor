"use client";

import { Html } from "@react-three/drei";

function Treadmill({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base / belt */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.6, 0.15, 1.5]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Belt surface */}
      <mesh position={[0, 0.23, 0]}>
        <boxGeometry args={[0.5, 0.02, 1.4]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Upright panel */}
      <mesh position={[0, 0.9, -0.65]}>
        <boxGeometry args={[0.5, 1.2, 0.06]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      {/* Display screen */}
      <mesh position={[0, 1.3, -0.62]}>
        <boxGeometry args={[0.25, 0.18, 0.03]} />
        <meshStandardMaterial color="#0a1628" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>
      {/* Handlebars */}
      <mesh position={[-0.22, 0.85, -0.4]}>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color="#666" metalness={0.5} />
      </mesh>
      <mesh position={[0.22, 0.85, -0.4]}>
        <boxGeometry args={[0.04, 0.5, 0.04]} />
        <meshStandardMaterial color="#666" metalness={0.5} />
      </mesh>
    </group>
  );
}

function WeightsBench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Bench pad */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.4, 0.08, 1.2]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      {/* Bench legs */}
      {[[-0.15, 0, -0.5], [0.15, 0, -0.5], [-0.15, 0, 0.5], [0.15, 0, 0.5]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.2, p[2]]}>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      ))}
      {/* Barbell rack uprights */}
      <mesh position={[-0.25, 0.7, -0.4]}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      <mesh position={[0.25, 0.7, -0.4]}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      {/* Barbell */}
      <mesh position={[0, 0.95, -0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
        <meshStandardMaterial color="#888" metalness={0.7} />
      </mesh>
      {/* Weight plates */}
      {[-0.4, 0.4].map((x, i) => (
        <mesh key={i} position={[x, 0.95, -0.4]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 12]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
    </group>
  );
}

function DumbbellRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Rack frame */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.2, 0.04, 0.3]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[1.2, 0.04, 0.3]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      {/* Uprights */}
      {[-0.55, 0, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.04, 0.7, 0.04]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      ))}
      {/* Dumbbells on top shelf */}
      {[-0.35, -0.15, 0.05, 0.25, 0.45].map((x, i) => (
        <group key={i} position={[x, 0.56, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.01, 0.01, 0.18, 6]} />
            <meshStandardMaterial color="#888" metalness={0.5} />
          </mesh>
          {[-0.08, 0.08].map((ox, j) => (
            <mesh key={j} position={[ox, 0, 0]}>
              <boxGeometry args={[0.04, 0.05, 0.05]} />
              <meshStandardMaterial color={["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"][i]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function GymRoom({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Rubber floor */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 8]} />
        <meshStandardMaterial color="#555" transparent opacity={0.3} />
      </mesh>

      {/* Treadmills */}
      <Treadmill position={[-2.5, 0, 2]} />
      <Treadmill position={[-1.2, 0, 2]} />

      {/* Weights bench */}
      <WeightsBench position={[1.5, 0, -1]} />

      {/* Dumbbell rack against wall */}
      <DumbbellRack position={[-2.5, 0, -2.5]} />

      {/* Yoga mat */}
      <mesh position={[1.5, 0.02, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 1.6]} />
        <meshStandardMaterial color="#7c3aed" transparent opacity={0.7} />
      </mesh>

      {/* Exercise ball */}
      <mesh position={[2.5, 0.3, 0]}>
        <sphereGeometry args={[0.3, 12, 8]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>

      {/* Mirror wall (back wall, high metalness) */}
      <mesh position={[0, 1.5, -3.3]}>
        <boxGeometry args={[5, 2.2, 0.04]} />
        <meshStandardMaterial color="#e8e8f0" metalness={0.8} roughness={0.1} />
      </mesh>

      {/* Label */}
      <Html position={[0, 2.7, -3.5]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 14, color: "#555", fontFamily: "system-ui", fontWeight: 700, background: "rgba(255,255,255,0.7)", padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>
          חדר כושר 🏋️
        </div>
      </Html>

      <pointLight position={[0, 2.5, 0]} color="#ffffff" intensity={0.3} distance={6} />
    </group>
  );
}
