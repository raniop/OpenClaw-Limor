import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";

const INSTRUCTIONS_PATH = resolve(__dirname, "..", "workspace", "state", "instructions.json");
const OLD_INSTRUCTIONS_PATH = resolve(__dirname, "..", "memory", "instructions.json");
const MAX_INSTRUCTIONS = 50;

interface Instruction {
  text: string;
  savedAt: string;
}

interface InstructionsStore {
  instructions: Instruction[];
}

function loadStore(): InstructionsStore {
  return loadWithFallback<InstructionsStore>(INSTRUCTIONS_PATH, OLD_INSTRUCTIONS_PATH, { instructions: [] });
}

function saveStore(store: InstructionsStore): void {
  writeFileSync(INSTRUCTIONS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function saveInstruction(text: string): void {
  const store = loadStore();

  // Check for duplicates
  const exists = store.instructions.some(
    (i) => i.text.toLowerCase().trim() === text.toLowerCase().trim()
  );
  if (exists) return;

  store.instructions.push({
    text,
    savedAt: new Date().toISOString().split("T")[0],
  });

  // Trim to max
  if (store.instructions.length > MAX_INSTRUCTIONS) {
    store.instructions = store.instructions.slice(-MAX_INSTRUCTIONS);
  }

  saveStore(store);
}

export function removeInstruction(query: string): string {
  const store = loadStore();
  const index = parseInt(query, 10);

  if (!isNaN(index) && index >= 1 && index <= store.instructions.length) {
    const removed = store.instructions.splice(index - 1, 1);
    saveStore(store);
    return `הסרתי: "${removed[0].text}"`;
  }

  // Search by text
  const idx = store.instructions.findIndex((i) =>
    i.text.includes(query) || query.includes(i.text)
  );
  if (idx !== -1) {
    const removed = store.instructions.splice(idx, 1);
    saveStore(store);
    return `הסרתי: "${removed[0].text}"`;
  }

  return `לא מצאתי הוראה שמתאימה ל-"${query}"`;
}

export function listInstructions(): string {
  const store = loadStore();
  if (store.instructions.length === 0) return "אין הוראות שמורות.";
  return store.instructions
    .map((inst, i) => `${i + 1}. ${inst.text}`)
    .join("\n");
}

export function getInstructionsContext(): string {
  const store = loadStore();
  if (store.instructions.length === 0) return "";

  const lines: string[] = [];
  lines.push("## הוראות מיוחדות מרני (עקבי אחריהן תמיד!)");
  for (const inst of store.instructions) {
    lines.push(`- ${inst.text}`);
  }
  return lines.join("\n");
}
