"use client";

import { Sparkles } from "@react-three/drei";

export function AmbientEffects() {
  return (
    <>
      {/* Floating particles */}
      <Sparkles
        count={150}
        scale={[25, 8, 20]}
        position={[0, 4, 2]}
        size={1.5}
        speed={0.3}
        opacity={0.3}
        color="#6366f1"
      />
      <Sparkles
        count={50}
        scale={[25, 6, 20]}
        position={[0, 3, 2]}
        size={1}
        speed={0.2}
        opacity={0.2}
        color="#f59e0b"
      />
    </>
  );
}
