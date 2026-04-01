"use client";

export function BreakArea({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Floor marking */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#0c0a08" transparent opacity={0.3} />
      </mesh>

      {/* Small round table */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 16]} />
        <meshStandardMaterial color="#2a1f14" />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.55, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Stools */}
      {[[0.5, 0, 0.3], [-0.5, 0, 0.3], [0, 0, -0.5]].map((pos, i) => (
        <group key={i} position={[pos[0], pos[1], pos[2]]}>
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.04, 12]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.36, 6]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        </group>
      ))}

      {/* Coffee machine */}
      <group position={[-1.5, 0, -0.8]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.4, 1, 0.35]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {/* Red light */}
        <mesh position={[0.1, 0.8, 0.18]}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
        </mesh>
      </group>

      {/* Plant */}
      <group position={[1.5, 0, -0.8]}>
        {/* Pot */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.15, 0.12, 0.3, 8]} />
          <meshStandardMaterial color="#6b4226" />
        </mesh>
        {/* Leaves (cones) */}
        <mesh position={[0, 0.55, 0]}>
          <coneGeometry args={[0.2, 0.4, 6]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.1} />
        </mesh>
        <mesh position={[0.08, 0.7, 0.05]}>
          <coneGeometry args={[0.12, 0.25, 6]} />
          <meshStandardMaterial color="#16a34a" emissive="#16a34a" emissiveIntensity={0.1} />
        </mesh>
      </group>

      {/* Warm light */}
      <pointLight position={[0, 2, 0]} color="#fbbf24" intensity={0.3} distance={4} />
    </group>
  );
}
