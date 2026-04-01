"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type AnimState = "idle" | "walking" | "typing" | "talking" | "presenting";

interface VoxelCharacterProps {
  color: string;
  animState: AnimState;
  isOrchestrator?: boolean;
}

export function VoxelCharacter({ color, animState, isOrchestrator }: VoxelCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const baseColor = new THREE.Color(color);
  const darkColor = baseColor.clone().multiplyScalar(0.6);
  const lightColor = baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.3);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Body bob
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 1.5) * 0.02;
    }

    // Head
    if (headRef.current) {
      if (animState === "talking") {
        headRef.current.rotation.x = Math.sin(t * 3) * 0.1;
        headRef.current.rotation.y = Math.sin(t * 1.5) * 0.15;
      } else if (animState === "idle") {
        headRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
        headRef.current.rotation.x = 0;
      } else {
        headRef.current.rotation.y = 0;
        headRef.current.rotation.x = 0;
      }
    }

    // Arms
    if (leftArmRef.current && rightArmRef.current) {
      if (animState === "walking") {
        leftArmRef.current.rotation.x = Math.sin(t * 4) * 0.4;
        rightArmRef.current.rotation.x = Math.sin(t * 4 + Math.PI) * 0.4;
      } else if (animState === "typing") {
        leftArmRef.current.rotation.x = -0.8 + Math.sin(t * 6) * 0.08;
        rightArmRef.current.rotation.x = -0.8 + Math.sin(t * 6 + 1) * 0.08;
      } else if (animState === "presenting") {
        leftArmRef.current.rotation.x = -1.2;
        rightArmRef.current.rotation.x = Math.sin(t * 2) * 0.2;
      } else if (animState === "talking") {
        leftArmRef.current.rotation.x = Math.sin(t * 2) * 0.15;
        rightArmRef.current.rotation.x = Math.sin(t * 2.5 + 1) * 0.15;
      } else {
        leftArmRef.current.rotation.x = Math.sin(t * 0.8) * 0.05;
        rightArmRef.current.rotation.x = Math.sin(t * 0.8 + 0.5) * 0.05;
      }
    }

    // Legs
    if (leftLegRef.current && rightLegRef.current) {
      if (animState === "walking") {
        leftLegRef.current.rotation.x = Math.sin(t * 4) * 0.5;
        rightLegRef.current.rotation.x = Math.sin(t * 4 + Math.PI) * 0.5;
      } else {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <group ref={headRef} position={[0, 1.35, 0]}>
        <mesh>
          <boxGeometry args={[0.45, 0.45, 0.45]} />
          <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={0.15} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.1, 0.02, 0.23]}>
          <boxGeometry args={[0.08, 0.06, 0.02]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0.1, 0.02, 0.23]}>
          <boxGeometry args={[0.08, 0.06, 0.02]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        {/* Crown for orchestrator */}
        {isOrchestrator && (
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[0.4, 0.15, 0.4]} />
            <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.5} />
          </mesh>
        )}
      </group>

      {/* Body */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.55, 0.6, 0.35]} />
        <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={0.1} />
      </mesh>

      {/* Left Arm - pivot at shoulder */}
      <group ref={leftArmRef} position={[-0.4, 1.05, 0]}>
        <mesh position={[0, -0.3, 0]}>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={darkColor} emissive={darkColor} emissiveIntensity={0.08} />
        </mesh>
      </group>

      {/* Right Arm - pivot at shoulder */}
      <group ref={rightArmRef} position={[0.4, 1.05, 0]}>
        <mesh position={[0, -0.3, 0]}>
          <boxGeometry args={[0.18, 0.55, 0.22]} />
          <meshStandardMaterial color={darkColor} emissive={darkColor} emissiveIntensity={0.08} />
        </mesh>
      </group>

      {/* Left Leg - pivot at hip */}
      <group ref={leftLegRef} position={[-0.15, 0.45, 0]}>
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[0.2, 0.5, 0.25]} />
          <meshStandardMaterial color={darkColor} emissive={darkColor} emissiveIntensity={0.05} />
        </mesh>
      </group>

      {/* Right Leg - pivot at hip */}
      <group ref={rightLegRef} position={[0.15, 0.45, 0]}>
        <mesh position={[0, -0.28, 0]}>
          <boxGeometry args={[0.2, 0.5, 0.25]} />
          <meshStandardMaterial color={darkColor} emissive={darkColor} emissiveIntensity={0.05} />
        </mesh>
      </group>
    </group>
  );
}
