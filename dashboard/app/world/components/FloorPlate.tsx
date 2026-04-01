"use client";

import { Grid } from "@react-three/drei";

interface FloorPlateProps {
  y: number;
  width?: number;
  depth?: number;
  color?: string;
}

/** Concrete floor/ceiling slab */
export function FloorPlate({ y, width = 20, depth = 14, color = "#c8c4b8" }: FloorPlateProps) {
  return (
    <group>
      {/* Floor surface */}
      <mesh position={[0, y - 0.01, 7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Tile grid */}
      <Grid
        position={[0, y, 7]}
        args={[width, depth]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#b8b4a8"
        sectionSize={5}
        sectionThickness={0.5}
        sectionColor="#aaa89c"
        fadeDistance={30}
        fadeStrength={1}
        infiniteGrid={false}
      />
      {/* Slab edge (visible from outside) */}
      <mesh position={[0, y - 0.1, 7]}>
        <boxGeometry args={[width, 0.2, depth]} />
        <meshStandardMaterial color="#b0ada0" />
      </mesh>
    </group>
  );
}
