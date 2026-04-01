"use client";

interface FloorSelectorProps {
  selectedFloor: number;
  onSelectFloor: (floor: number) => void;
}

const FLOORS = [
  { id: 3, label: "קומה 3", desc: "Penthouse", icon: "🐾" },
  { id: 2, label: "קומה 2", desc: "משרדים", icon: "🏢" },
  { id: 1, label: "קומה 1", desc: "לובי", icon: "🏠" },
];

export function FloorSelector({ selectedFloor, onSelectFloor }: FloorSelectorProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {FLOORS.map((floor) => {
        const isSelected = selectedFloor === floor.id;
        return (
          <button
            key={floor.id}
            onClick={() => onSelectFloor(floor.id)}
            style={{
              background: isSelected ? "rgba(245, 158, 11, 0.2)" : "rgba(10, 10, 20, 0.75)",
              backdropFilter: "blur(12px)",
              border: isSelected ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: isSelected ? "#f59e0b" : "#aaa",
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              fontWeight: isSelected ? 700 : 400,
              transition: "all 0.2s",
              minWidth: 120,
            }}
          >
            <span style={{ fontSize: 16 }}>{floor.icon}</span>
            <div>
              <div>{floor.label}</div>
              <div style={{ fontSize: 9, color: "#777" }}>{floor.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
