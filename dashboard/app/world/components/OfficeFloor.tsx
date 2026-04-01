"use client";

import { Grid } from "@react-three/drei";

export function OfficeFloor() {
  return (
    <>
      {/* Main floor */}
      <mesh position={[0, -0.01, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[36, 28]} />
        <meshStandardMaterial color="#c8c4b8" />
      </mesh>

      {/* Tile grid */}
      <Grid
        position={[0, 0, 2]}
        args={[36, 28]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#b8b4a8"
        sectionSize={6}
        sectionThickness={0.6}
        sectionColor="#a8a498"
        fadeDistance={35}
        fadeStrength={1}
        infiniteGrid={false}
      />

      {/* Zone tints */}
      {/* Server Room */}
      <mesh position={[-12.5, 0.015, 11]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#b8d4c0" transparent opacity={0.15} />
      </mesh>
      {/* Gym Room */}
      <mesh position={[-12.5, 0.015, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#666" transparent opacity={0.15} />
      </mesh>
      {/* Break Area */}
      <mesh position={[-12.5, 0.015, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#d4c8b0" transparent opacity={0.15} />
      </mesh>
      {/* Limor's Office */}
      <mesh position={[12.5, 0.015, 11]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#d4c0a0" transparent opacity={0.15} />
      </mesh>
      {/* Game Room */}
      <mesh position={[12.5, 0.015, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#d4b896" transparent opacity={0.12} />
      </mesh>
      {/* Meeting Room */}
      <mesh position={[12.5, 0.015, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#b8c4d4" transparent opacity={0.15} />
      </mesh>
      {/* Hallway - subtle lighter strip */}
      <mesh position={[0, 0.015, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 24]} />
        <meshStandardMaterial color="#d8d4cc" transparent opacity={0.1} />
      </mesh>
    </>
  );
}
