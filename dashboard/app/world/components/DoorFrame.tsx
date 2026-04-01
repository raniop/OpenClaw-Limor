"use client";

const FRAME_COLOR = "#5a4030";
const DOOR_COLOR = "#8b7355";

interface DoorFrameProps {
  position: [number, number, number];
  rotation?: number; // Y rotation (0 = facing z, PI/2 = facing x)
  width?: number;
  height?: number;
  open?: boolean; // show door panel swung open
}

export function DoorFrame({
  position,
  rotation = 0,
  width = 1.3,
  height = 2.6,
  open = true,
}: DoorFrameProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Left post */}
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.08, height, 0.14]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      {/* Right post */}
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[0.08, height, 0.14]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      {/* Top crossbar */}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[width + 0.16, 0.08, 0.14]} />
        <meshStandardMaterial color={FRAME_COLOR} />
      </mesh>
      {/* Door panel (swung open) */}
      {open && (
        <group position={[-width / 2 + 0.04, 0, 0]} rotation={[0, -Math.PI / 3, 0]}>
          <mesh position={[width / 2 - 0.03, height / 2, 0]}>
            <boxGeometry args={[width - 0.08, height - 0.05, 0.05]} />
            <meshStandardMaterial color={DOOR_COLOR} />
          </mesh>
          {/* Door handle */}
          <mesh position={[width - 0.15, height / 2, 0.05]}>
            <boxGeometry args={[0.1, 0.04, 0.06]} />
            <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}
