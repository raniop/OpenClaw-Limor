"use client";

function LightPanel({ position, withLight = false }: { position: [number, number, number]; withLight?: boolean }) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={[1.2, 0.06, 0.4]} /><meshStandardMaterial color="#e0e0e0" /></mesh>
      <mesh position={[0, -0.04, 0]}><boxGeometry args={[1.0, 0.02, 0.3]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} /></mesh>
      {withLight && <pointLight position={[0, -0.2, 0]} intensity={0.35} distance={6} color="#f5f0e8" />}
    </group>
  );
}

export function CeilingLights() {
  return (
    <group>
      {/* Left offices (x=-6) */}
      <LightPanel position={[-6, 2.95, 11]} withLight />
      <LightPanel position={[-6, 2.95, 5]} withLight />
      <LightPanel position={[-6, 2.95, -1]} withLight />
      <LightPanel position={[-6, 2.95, -7]} withLight />

      {/* Right offices (x=6) */}
      <LightPanel position={[6, 2.95, 11]} withLight />
      <LightPanel position={[6, 2.95, 5]} withLight />
      <LightPanel position={[6, 2.95, -1]} withLight />

      {/* Hallway (x=0) */}
      <LightPanel position={[0, 2.95, 11]} />
      <LightPanel position={[0, 2.95, 5]} />
      <LightPanel position={[0, 2.95, -1]} />
      <LightPanel position={[0, 2.95, -7]} />

      {/* Side rooms */}
      <LightPanel position={[-12.5, 2.95, 11]} />
      <LightPanel position={[-12.5, 2.95, 5]} />
      <LightPanel position={[-12.5, 2.95, -1]} />
      <LightPanel position={[12.5, 2.95, 11]} />
      <LightPanel position={[12.5, 2.95, 5]} />
      <LightPanel position={[12.5, 2.95, -1]} />
    </group>
  );
}
