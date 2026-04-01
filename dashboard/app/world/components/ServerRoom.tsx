"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function ServerRack({ position }: { position: [number, number, number] }) {
  const lightsRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!lightsRef.current) return;
    const t = clock.getElapsedTime();
    lightsRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      // Random blinking pattern
      const blink = Math.sin(t * (3 + i * 1.7) + i * 5) > 0.3;
      mat.emissiveIntensity = blink ? 0.8 : 0.1;
    });
  });

  return (
    <group position={position}>
      {/* Rack body */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.8, 2, 0.5]} />
        <meshStandardMaterial color="#111118" />
      </mesh>
      {/* Rack shelves */}
      {[0.3, 0.7, 1.1, 1.5].map((y, i) => (
        <mesh key={i} position={[0, y, 0.05]}>
          <boxGeometry args={[0.7, 0.15, 0.45]} />
          <meshStandardMaterial color="#0a0a12" />
        </mesh>
      ))}
      {/* Status lights */}
      <group ref={lightsRef}>
        {[0.35, 0.75, 1.15, 1.55].map((y, i) => (
          <mesh key={i} position={[0.3, y, 0.28]}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? "#22c55e" : "#3b82f6"}
              emissive={i % 2 === 0 ? "#22c55e" : "#3b82f6"}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function ServerRoom({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Floor marking */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 4]} />
        <meshStandardMaterial color="#0a0a18" transparent opacity={0.5} />
      </mesh>

      {/* Server racks */}
      <ServerRack position={[-1.5, 0, -1]} />
      <ServerRack position={[-0.5, 0, -1]} />
      <ServerRack position={[0.5, 0, -1]} />
      <ServerRack position={[1.5, 0, -1]} />

      {/* Desks for DevOps agents */}
      {/* Small monitoring stations */}
      {[[-1, 0, 1], [1, 0, 1]].map((pos, i) => (
        <group key={i} position={[pos[0], pos[1], pos[2]]}>
          {/* Small desk */}
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[1, 0.04, 0.5]} />
            <meshStandardMaterial color="#1a1520" />
          </mesh>
          {/* Monitor */}
          <mesh position={[0, 0.85, -0.1]}>
            <boxGeometry args={[0.6, 0.4, 0.03]} />
            <meshStandardMaterial color="#0a1628" emissive="#22c55e" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}

      {/* Ambient green glow */}
      <pointLight position={[0, 1.5, 0]} color="#22c55e" intensity={0.3} distance={5} />
    </group>
  );
}
