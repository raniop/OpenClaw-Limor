export const AGENT_COLORS: Record<string, string> = {
  limor: "#f59e0b",
  michal: "#8b5cf6",
  ronit: "#3b82f6",
  noa: "#06b6d4",
  yael: "#f97316",
  tal: "#ef4444",
  maya: "#22c55e",
  adi: "#a855f7",
  hila: "#ec4899",
  dana: "#14b8a6",
  boris: "#6366f1",
  yuri: "#0ea5e9",
  nimrod: "#dc2626",
  amit: "#84cc16",
  alma: "#fbbf24",
};

// 3-floor building: x: -10 to 10, z: 0 to 14
// Floor 1 (y=0): Lobby + Meeting + Break
// Floor 2 (y=3.5): Private offices
// Floor 3 (y=7): Penthouse (Limor, Server, Gym, Game)
//
// Floor 2 offices layout:
//   x: -10..-5 | -5..-1 | -1..1 (hall) | 1..5 | 5..10
//   z: 0..7 (bottom row) | 7..14 (top row)

export const FLOOR_Y = { 1: 0, 2: 3.5, 3: 7 };

export const AGENT_DESKS: Record<string, { pos: [number, number, number]; zone: string; floor: number }> = {
  // Floor 2 - Top row (z=7..14, desks at ~z=10.5)
  boris:  { pos: [-8, 0, 10], zone: "office", floor: 2 },
  yuri:   { pos: [-6.5, 0, 10], zone: "office", floor: 2 },
  michal: { pos: [-3.5, 0, 10], zone: "office", floor: 2 },
  ronit:  { pos: [-2, 0, 10], zone: "office", floor: 2 },
  noa:    { pos: [2, 0, 10], zone: "office", floor: 2 },
  yael:   { pos: [3.5, 0, 10], zone: "office", floor: 2 },
  nimrod: { pos: [6.5, 0, 10], zone: "office", floor: 2 },
  amit:   { pos: [8, 0, 10], zone: "office", floor: 2 },

  // Floor 2 - Bottom row (z=0..7, desks at ~z=3.5)
  tal:    { pos: [-8, 0, 3], zone: "office", floor: 2 },
  maya:   { pos: [-6.5, 0, 3], zone: "office", floor: 2 },
  adi:    { pos: [-3.5, 0, 3], zone: "office", floor: 2 },
  dana:   { pos: [-2, 0, 3], zone: "office", floor: 2 },
  alma:   { pos: [2, 0, 3], zone: "office", floor: 2 },
  hila:   { pos: [3.5, 0, 3], zone: "office", floor: 2 },

  // Floor 3 - Limor's office
  limor:  { pos: [5, 0, 10.5], zone: "command", floor: 3 },
};

export const OFFICE_PAIRS = [
  { id: "boris_yuri",   names: "בוריס + יורי",  emoji: "🔧💻", doorPos: [-5, 0, 10.5] as [number, number, number] },
  { id: "michal_ronit", names: "מיכל + רונית",  emoji: "👁️🔍", doorPos: [-1, 0, 10.5] as [number, number, number] },
  { id: "noa_yael",     names: "נועה + יעל",    emoji: "📊⚡", doorPos: [1, 0, 10.5] as [number, number, number] },
  { id: "nimrod_amit",  names: "נמרוד + עמית",  emoji: "🔐📦", doorPos: [5, 0, 10.5] as [number, number, number] },
  { id: "tal_maya",     names: "טל + מאיה",     emoji: "🛡️🏠", doorPos: [-5, 0, 3.5] as [number, number, number] },
  { id: "adi_dana",     names: "עדי + דנה",     emoji: "📅🛒", doorPos: [-1, 0, 3.5] as [number, number, number] },
  { id: "alma_hila",    names: "אלמה + הילה",   emoji: "🌸🍽️", doorPos: [1, 0, 3.5] as [number, number, number] },
];

export const ZONES = {
  commandCenter: { pos: [5, 0, 10.5] as [number, number, number] },
  serverRoom:    { pos: [-5, 0, 10.5] as [number, number, number] },
  gymRoom:       { pos: [-5, 0, 3.5] as [number, number, number] },
  gameRoom:      { pos: [5, 0, 3.5] as [number, number, number] },
  meetingRoom:   { pos: [-6, 0, 10.5] as [number, number, number] },
  breakArea:     { pos: [-6, 0, 3.5] as [number, number, number] },
};

export const WALK_TARGETS = [
  { name: "hallway1", pos: [0, 0, 3] as [number, number, number] },
  { name: "hallway2", pos: [0, 0, 7] as [number, number, number] },
  { name: "hallway3", pos: [0, 0, 11] as [number, number, number] },
  { name: "lounge",   pos: [7.5, 0, 3.5] as [number, number, number] },
];
