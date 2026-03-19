import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";

const USERS_DIR = resolve(__dirname, "..", "workspace", "memory", "users");
// Fallback: old path for migration
const OLD_MEMORY_PATH = resolve(__dirname, "..", "memory", "memories.json");

// Ensure users directory exists
if (!existsSync(USERS_DIR)) mkdirSync(USERS_DIR, { recursive: true });

interface Fact {
  text: string;
  savedAt: string;
}

interface UserMemory {
  name?: string;
  facts: Fact[];
}

// Sanitize chatId for filename (replace special chars)
function sanitizeChatId(chatId: string): string {
  return chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getUserFilePath(chatId: string): string {
  return join(USERS_DIR, `${sanitizeChatId(chatId)}.md`);
}

function loadUserMemory(chatId: string): UserMemory {
  const filePath = getUserFilePath(chatId);
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf-8");
      return parseUserMarkdown(content);
    } catch {
      return { facts: [] };
    }
  }

  // Fallback: migrate from old JSON store
  const oldMem = loadFromOldStore(chatId);
  if (oldMem.facts.length > 0 || oldMem.name) {
    saveUserMemory(chatId, oldMem);
    console.log(`[memory] Migrated user ${sanitizeChatId(chatId)} from JSON → markdown (${oldMem.facts.length} facts)`);
  }
  return oldMem;
}

function loadFromOldStore(chatId: string): UserMemory {
  if (!existsSync(OLD_MEMORY_PATH)) return { facts: [] };
  try {
    const store = JSON.parse(readFileSync(OLD_MEMORY_PATH, "utf-8"));
    const entry = store[chatId];
    if (!entry) return { facts: [] };
    return {
      name: entry.name,
      facts: Array.isArray(entry.facts) ? entry.facts : [],
    };
  } catch {
    return { facts: [] };
  }
}

function parseUserMarkdown(content: string): UserMemory {
  const mem: UserMemory = { facts: [] };
  const lines = content.split("\n");

  for (const line of lines) {
    const nameMatch = line.match(/^Name:\s*(.+)$/);
    if (nameMatch) {
      mem.name = nameMatch[1].trim();
      continue;
    }
    const factMatch = line.match(/^- (.+)$/);
    if (factMatch && !line.includes("Name:")) {
      mem.facts.push({ text: factMatch[1].trim(), savedAt: "" });
    }
  }
  return mem;
}

function saveUserMemory(chatId: string, mem: UserMemory): void {
  const lines: string[] = [];
  lines.push("# User Profile");
  if (mem.name) {
    lines.push(`Name: ${mem.name}`);
  }
  lines.push("");
  if (mem.facts.length > 0) {
    lines.push("## Known Facts");
    for (const fact of mem.facts) {
      lines.push(`- ${fact.text}`);
    }
  }
  writeFileSync(getUserFilePath(chatId), lines.join("\n"), "utf-8");
}

export function getMemoryContext(chatId: string): string {
  const mem = loadUserMemory(chatId);
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

// Common Hebrew↔English transliterations for better dedup
const TRANSLITERATIONS: Record<string, string> = {
  "קונטרול": "control", "קונטרולר": "controller", "אופוס": "opus",
  "סונט": "sonnet", "טלגרם": "telegram", "וואטסאפ": "whatsapp",
  "גט": "gett", "פרגולה": "pergula", "סלון": "salon",
};

function normalizeForComparison(s: string): string {
  let n = s.replace(/[^א-תa-z0-9\s]/gi, "").toLowerCase().trim();
  // Apply transliterations
  for (const [heb, eng] of Object.entries(TRANSLITERATIONS)) {
    n = n.replace(new RegExp(heb, "g"), eng);
  }
  return n;
}

function isSimilar(a: string, b: string): boolean {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const ratio = overlap / Math.min(wordsA.size, wordsB.size);
  return ratio > 0.6; // lowered from 0.7 for better dedup
}

const MAX_FACTS_PER_USER = 50;

export function saveExtractedFacts(
  chatId: string,
  facts: string[],
  userName?: string
): void {
  if (facts.length === 0 && !userName) return;

  const mem = loadUserMemory(chatId);
  if (userName) {
    mem.name = userName;
  }

  const today = new Date().toISOString().split("T")[0];

  for (const fact of facts) {
    const hasSimilar = mem.facts.some((f) => isSimilar(f.text, fact));
    if (!hasSimilar) {
      mem.facts.push({ text: fact, savedAt: today });
    }
  }

  if (mem.facts.length > MAX_FACTS_PER_USER) {
    mem.facts = mem.facts.slice(-MAX_FACTS_PER_USER);
  }

  // Trigger AI cleanup when facts accumulate duplicates (every 20 facts)
  if (mem.facts.length > 0 && mem.facts.length % 20 === 0) {
    cleanupFactsWithAI(chatId, mem).catch(() => {});
  }

  saveUserMemory(chatId, mem);
}

/**
 * Use Claude to consolidate and deduplicate facts.
 * Runs in background, doesn't block the response.
 */
async function cleanupFactsWithAI(chatId: string, mem: UserMemory): Promise<void> {
  if (mem.facts.length < 5) return;

  try {
    const { client } = require("./ai/client");
    const factsText = mem.facts.map(f => `- ${f.text}`).join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: `אתה עוזר לנקות רשימת עובדות על אדם. מחק כפילויות, אחד עובדות דומות, ושמור רק מידע חשוב ורלוונטי.
החזר JSON בלבד: {"facts": ["עובדה 1", "עובדה 2", ...]}
כללים:
- אם שתי עובדות אומרות את אותו דבר (גם בניסוחים שונים או בעברית/אנגלית) — אחד אותן לאחת
- מחק עובדות שכבר לא רלוונטיות (בקשות חד-פעמיות שטופלו)
- שמור על עובדות אישיות חשובות (שם, משפחה, עבודה, מספרי טלפון, העדפות)
- כתוב בעברית`,
      messages: [{ role: "user", content: `נקה את רשימת העובדות הזו:\n${factsText}` }],
    });

    const text = response.content.find((b: any) => b.type === "text")?.text || "";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.facts) && parsed.facts.length > 0) {
      const cleaned: Fact[] = parsed.facts.map((f: string) => ({
        text: f,
        savedAt: new Date().toISOString().split("T")[0],
      }));
      mem.facts = cleaned;
      saveUserMemory(chatId, mem);
      console.log(`[memory] AI cleanup for ${sanitizeChatId(chatId)}: ${factsText.split("\n").length} → ${cleaned.length} facts`);
    }
  } catch (err) {
    // Silent failure — cleanup is best-effort
  }
}
