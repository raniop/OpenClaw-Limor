import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const MEMORY_PATH = resolve(__dirname, "..", "memory", "memories.json");

interface Fact {
  text: string;
  savedAt: string;
}

interface UserMemory {
  name?: string;
  facts: Fact[];
}

type MemoryStore = Record<string, UserMemory>;

function loadStore(): MemoryStore {
  if (!existsSync(MEMORY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MEMORY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveStore(store: MemoryStore): void {
  writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function getMemoryContext(chatId: string): string {
  const store = loadStore();
  const mem = store[chatId];
  if (!mem || mem.facts.length === 0) return "";

  const lines: string[] = [];
  lines.push("## מה שאת זוכרת על המשתמש הזה");
  if (mem.name) {
    lines.push(`- השם שלו: ${mem.name}`);
  }
  for (const fact of mem.facts) {
    lines.push(`- ${fact.text}`);
  }
  return lines.join("\n");
}

function isSimilar(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/[^א-תa-z0-9\s]/gi, "").toLowerCase().trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // Check if one contains the other (for near-duplicates)
  if (na.includes(nb) || nb.includes(na)) return true;
  // Check word overlap
  const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const ratio = overlap / Math.min(wordsA.size, wordsB.size);
  return ratio > 0.7;
}

const MAX_FACTS_PER_USER = 15;

export function saveExtractedFacts(
  chatId: string,
  facts: string[],
  userName?: string
): void {
  if (facts.length === 0 && !userName) return;

  const store = loadStore();
  if (!store[chatId]) {
    store[chatId] = { facts: [] };
  }

  if (userName) {
    store[chatId].name = userName;
  }

  const today = new Date().toISOString().split("T")[0];

  for (const fact of facts) {
    // Skip if similar fact already exists
    const hasSimilar = store[chatId].facts.some((f) => isSimilar(f.text, fact));
    if (!hasSimilar) {
      store[chatId].facts.push({ text: fact, savedAt: today });
    }
  }

  // Keep only the most recent facts if over limit
  if (store[chatId].facts.length > MAX_FACTS_PER_USER) {
    store[chatId].facts = store[chatId].facts.slice(-MAX_FACTS_PER_USER);
  }

  saveStore(store);
}
