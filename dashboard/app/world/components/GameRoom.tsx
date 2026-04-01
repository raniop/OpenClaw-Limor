"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

function PingPongTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table surface - green */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[1.5, 0.05, 2.7]} />
        <meshStandardMaterial color="#1a6b3c" />
      </mesh>
      {/* White center line */}
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[1.5, 0.005, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* White edge lines */}
      <mesh position={[0, 0.78, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.02, 0.005, 2.7]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Net */}
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[1.6, 0.15, 0.02]} />
        <meshStandardMaterial color="#eee" transparent opacity={0.6} />
      </mesh>
      {/* Net posts */}
      <mesh position={[-0.8, 0.85, 0]}>
        <boxGeometry args={[0.03, 0.2, 0.03]} />
        <meshStandardMaterial color="#666" />
      </mesh>
      <mesh position={[0.8, 0.85, 0]}>
        <boxGeometry args={[0.03, 0.2, 0.03]} />
        <meshStandardMaterial color="#666" />
      </mesh>
      {/* Legs */}
      {[[-0.6, 0, -1.2], [0.6, 0, -1.2], [-0.6, 0, 1.2], [0.6, 0, 1.2]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.375, p[2]]}>
          <boxGeometry args={[0.06, 0.75, 0.06]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
    </group>
  );
}

function FoosballTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table body */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.7, 0.3, 1.4]} />
        <meshStandardMaterial color="#5a3a1a" />
      </mesh>
      {/* Playing field (green inside) */}
      <mesh position={[0, 0.86, 0]}>
        <boxGeometry args={[0.55, 0.02, 1.2]} />
        <meshStandardMaterial color="#2d8a4e" />
      </mesh>
      {/* Rods (4 visible) */}
      {[-0.4, -0.15, 0.15, 0.4].map((z, i) => (
        <mesh key={i} position={[0, 0.85, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
          <meshStandardMaterial color="#bbb" metalness={0.6} />
        </mesh>
      ))}
      {/* Legs */}
      {[[-0.25, 0, -0.6], [0.25, 0, -0.6], [-0.25, 0, 0.6], [0.25, 0, 0.6]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.28, p[2]]}>
          <boxGeometry args={[0.06, 0.55, 0.06]} />
          <meshStandardMaterial color="#5a3a1a" />
        </mesh>
      ))}
    </group>
  );
}

function ArcadeCabinet({ position }: { position: [number, number, number] }) {
  const screenRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (screenRef.current) {
      const mat = screenRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
    }
  });

  return (
    <group position={position}>
      {/* Cabinet body */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.7, 1.6, 0.6]} />
        <meshStandardMaterial color="#1a1a3a" />
      </mesh>
      {/* Screen */}
      <mesh ref={screenRef} position={[0, 1.15, 0.31]}>
        <boxGeometry args={[0.5, 0.45, 0.02]} />
        <meshStandardMaterial color="#0a0a2a" emissive="#6366f1" emissiveIntensity={0.5} />
      </mesh>
      {/* Controls panel (angled) */}
      <mesh position={[0, 0.55, 0.25]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.55, 0.25, 0.04]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Buttons */}
      {[[-0.12, 0, 0], [0, 0, 0], [0.12, 0, 0]].map((p, i) => (
        <mesh key={i} position={[p[0] + 0, 0.6, 0.3]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial
            color={["#ef4444", "#22c55e", "#3b82f6"][i]}
            emissive={["#ef4444", "#22c55e", "#3b82f6"][i]}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
      {/* Marquee top */}
      <mesh position={[0, 1.55, 0.1]}>
        <boxGeometry args={[0.65, 0.15, 0.4]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function BeanBag({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.35, 10, 8]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export function GameRoom({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Carpet floor */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 8]} />
        <meshStandardMaterial color="#d4b896" transparent opacity={0.3} />
      </mesh>

      {/* Ping pong table */}
      <PingPongTable position={[0, 0, 1]} />

      {/* Foosball table */}
      <FoosballTable position={[-2, 0, -1.5]} />

      {/* Arcade cabinet */}
      <ArcadeCabinet position={[2.5, 0, -2.5]} />

      {/* Bean bags */}
      <BeanBag position={[-2.5, 0.2, 2]} color="#ef4444" />
      <BeanBag position={[-1.8, 0.2, 2.5]} color="#f59e0b" />

      {/* TV on wall */}
      <group position={[0, 2, 3.3]}>
        <mesh>
          <boxGeometry args={[1.8, 1.0, 0.06]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <boxGeometry args={[1.6, 0.85, 0.02]} />
          <meshStandardMaterial color="#0a1020" emissive="#1e40af" emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Label */}
      <Html position={[0, 2.7, 3.5]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
        <div style={{ fontSize: 14, color: "#555", fontFamily: "system-ui", fontWeight: 700, background: "rgba(255,255,255,0.7)", padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>
          חדר משחקים 🎮
        </div>
      </Html>

      <pointLight position={[0, 2.5, 0]} color="#fff5e0" intensity={0.3} distance={6} />
    </group>
  );
}
