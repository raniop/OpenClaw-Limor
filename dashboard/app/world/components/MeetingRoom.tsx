"use client";

export function MeetingRoom({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Floor marking */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#0c0c1a" transparent opacity={0.4} />
      </mesh>

      {/* Conference table */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[2.2, 0.06, 1.0]} />
        <meshStandardMaterial color="#2a1f14" />
      </mesh>
      {/* Table legs */}
      {[[-0.9, 0, -0.35], [0.9, 0, -0.35], [-0.9, 0, 0.35], [0.9, 0, 0.35]].map((leg, i) => (
        <mesh key={i} position={[leg[0], 0.3, leg[2]]}>
          <boxGeometry args={[0.06, 0.6, 0.06]} />
          <meshStandardMaterial color="#2a1f14" />
        </mesh>
      ))}

      {/* Chairs around table */}
      {[
        [-0.7, 0, -0.8],
        [0, 0, -0.8],
        [0.7, 0, -0.8],
        [-0.7, 0, 0.8],
        [0, 0, 0.8],
        [0.7, 0, 0.8],
      ].map((pos, i) => (
        <group key={i} position={[pos[0], pos[1], pos[2]]} rotation={[0, i < 3 ? 0 : Math.PI, 0]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.35, 0.04, 0.35]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[0, 0.55, -0.15]}>
            <boxGeometry args={[0.35, 0.35, 0.04]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
        </group>
      ))}

      {/* Whiteboard on wall */}
      <group position={[0, 1.5, -1.4]}>
        <mesh>
          <boxGeometry args={[2.5, 1.2, 0.05]} />
          <meshStandardMaterial color="#e8e8e8" />
        </mesh>
        {/* Frame */}
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[2.6, 1.3, 0.03]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      </group>
    </group>
  );
}
