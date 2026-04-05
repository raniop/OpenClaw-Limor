import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import { client as aiClient } from "./ai/client";
import { SONNET } from "./ai/model-router";

const USERS_DIR = resolve(__dirname, "..", "workspace", "memory", "users");
// Fallback: old path for migration
const OLD_MEMORY_PATH = resolve(__dirname, "..", "memory", "memories.json");

// Ensure users directory exists
if (!existsSync(USERS_DIR)) mkdirSync(USERS_DIR, { recursive: true });

interface Fact {
  text: string;
  savedAt: string;
}

interface EmotionalLogEntry {
  date: string;
  mood: string;
  context: string;
}

interface UserMemory {
  name?: string;
  facts: Fact[];
  preferences: Record<string, string[]>;
  patterns: string[];
  emotionalLog: EmotionalLogEntry[];
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
      return { facts: [], preferences: {}, patterns: [], emotionalLog: [] };
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
  if (!existsSync(OLD_MEMORY_PATH)) return { facts: [], preferences: {}, patterns: [], emotionalLog: [] };
  try {
    const store = JSON.parse(readFileSync(OLD_MEMORY_PATH, "utf-8"));
    const entry = store[chatId];
    if (!entry) return { facts: [], preferences: {}, patterns: [], emotionalLog: [] };
    return {
      name: entry.name,
      facts: Array.isArray(entry.facts) ? entry.facts : [],
      preferences: {},
      patterns: [],
      emotionalLog: [],
    };
  } catch {
    return { facts: [], preferences: {}, patterns: [], emotionalLog: [] };
  }
}

function parseUserMarkdown(content: string): UserMemory {
  const mem: UserMemory = { facts: [], preferences: {}, patterns: [], emotionalLog: [] };
  const lines = content.split("\n");

  let currentSection = "";
  let currentPrefCategory = "";

  for (const line of lines) {
    // Detect sections
    if (line.startsWith("## Known Facts")) { currentSection = "facts"; continue; }
    if (line.startsWith("## Preferences") || line.startsWith("## העדפות")) { currentSection = "preferences"; continue; }
    if (line.startsWith("## Patterns") || line.startsWith("## דפוסים")) { currentSection = "patterns"; continue; }
    if (line.startsWith("## Emotional Log") || line.startsWith("## יומן רגשי")) { currentSection = "emotional"; continue; }
    if (line.startsWith("## ")) { currentSection = ""; continue; }

    const nameMatch = line.match(/^Name:\s*(.+)$/);
    if (nameMatch) {
      mem.name = nameMatch[1].trim();
      continue;
    }

    if (currentSection === "facts") {
      const factMatch = line.match(/^- (.+)$/);
      if (factMatch) {
        mem.facts.push({ text: factMatch[1].trim(), savedAt: "" });
      }
    } else if (currentSection === "preferences") {
      // Sub-category header: "- מסעדות: ..."
      const catMatch = line.match(/^- ([^:]+):\s*(.+)$/);
      if (catMatch) {
        currentPrefCategory = catMatch[1].trim();
        mem.preferences[currentPrefCategory] = catMatch[2].split(",").map(s => s.trim()).filter(Boolean);
      } else {
        const subMatch = line.match(/^\s+- (.+)$/);
        if (subMatch && currentPrefCategory) {
          if (!mem.preferences[currentPrefCategory]) mem.preferences[currentPrefCategory] = [];
          mem.preferences[currentPrefCategory].push(subMatch[1].trim());
        }
      }
    } else if (currentSection === "patterns") {
      const patMatch = line.match(/^- (.+)$/);
      if (patMatch) {
        mem.patterns.push(patMatch[1].trim());
      }
    } else if (currentSection === "emotional") {
      // Format: "- 2026-03-19: לחוץ (דדליין בעבודה)"
      const emoMatch = line.match(/^- (\d{4}-\d{2}-\d{2}):\s*(\S+)\s*(?:\((.+)\))?$/);
      if (emoMatch) {
        mem.emotionalLog.push({
          date: emoMatch[1],
          mood: emoMatch[2],
          context: emoMatch[3] || "",
        });
      }
    } else if (!currentSection) {
      // Legacy: facts without section header
      const factMatch = line.match(/^- (.+)$/);
      if (factMatch && !line.includes("Name:")) {
        mem.facts.push({ text: factMatch[1].trim(), savedAt: "" });
      }
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
    lines.push("");
  }
  if (Object.keys(mem.preferences).length > 0) {
    lines.push("## העדפות");
    for (const [category, prefs] of Object.entries(mem.preferences)) {
      lines.push(`- ${category}: ${prefs.join(", ")}`);
    }
    lines.push("");
  }
  if (mem.patterns.length > 0) {
    lines.push("## דפוסים");
    for (const pattern of mem.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push("");
  }
  if (mem.emotionalLog.length > 0) {
    lines.push("## יומן רגשי");
    for (const entry of mem.emotionalLog.slice(-10)) { // Keep max 10
      const ctx = entry.context ? ` (${entry.context})` : "";
      lines.push(`- ${entry.date}: ${entry.mood}${ctx}`);
    }
    lines.push("");
  }
  writeFileSync(getUserFilePath(chatId), lines.join("\n"), "utf-8");
}

export function getMemoryContext(chatId: string): string {
  const mem = loadUserMemory(chatId);
  const hasContent = mem.facts.length > 0 || Object.keys(mem.preferences).length > 0 || mem.patterns.length > 0 || mem.emotionalLog.length > 0;
  if (!mem || !hasContent) return "";

  const lines: string[] = [];
  lines.push("## מה שאת זוכרת על המשתמש הזה");
  if (mem.name) {
    lines.push(`- השם שלו: ${mem.name}`);
  }
  for (const fact of mem.facts) {
    lines.push(`- ${fact.text}`);
  }

  if (Object.keys(mem.preferences).length > 0) {
    lines.push("");
    lines.push("### העדפות");
    for (const [category, prefs] of Object.entries(mem.preferences)) {
      lines.push(`- ${category}: ${prefs.join(", ")}`);
    }
  }

  if (mem.patterns.length > 0) {
    lines.push("");
    lines.push("### דפוסים שזיהית");
    for (const pattern of mem.patterns) {
      lines.push(`- ${pattern}`);
    }
  }

  if (mem.emotionalLog.length > 0) {
    // Only show last 3 emotional entries for context
    const recent = mem.emotionalLog.slice(-3);
    lines.push("");
    lines.push("### מצב רוח אחרון");
    for (const entry of recent) {
      const ctx = entry.context ? ` (${entry.context})` : "";
      lines.push(`- ${entry.date}: ${entry.mood}${ctx}`);
    }
  }

  return lines.join("\n");
}

/**
 * Save an emotional log entry for a user.
 * Keeps max 10 entries, rolling window.
 */
export function saveEmotionalState(chatId: string, mood: string, context: string): void {
  const mem = loadUserMemory(chatId);
  const today = new Date().toISOString().split("T")[0];

  // Don't add duplicate for same day and mood
  const existing = mem.emotionalLog.find(e => e.date === today && e.mood === mood);
  if (existing) return;

  mem.emotionalLog.push({ date: today, mood, context });

  // Keep max 10
  if (mem.emotionalLog.length > 10) {
    mem.emotionalLog = mem.emotionalLog.slice(-10);
  }

  saveUserMemory(chatId, mem);
}

/**
 * Save user preferences in a category.
 */
export function savePreference(chatId: string, category: string, values: string[]): void {
  const mem = loadUserMemory(chatId);
  const existing = mem.preferences[category] || [];

  for (const val of values) {
    if (!existing.some(e => isSimilar(e, val))) {
      existing.push(val);
    }
  }

  // Max 20 per category
  mem.preferences[category] = existing.slice(-20);
  saveUserMemory(chatId, mem);
}

/**
 * Save a detected behavioral pattern.
 */
export function savePattern(chatId: string, pattern: string): void {
  const mem = loadUserMemory(chatId);

  if (mem.patterns.some(p => isSimilar(p, pattern))) return;

  mem.patterns.push(pattern);

  // Max 10 patterns
  if (mem.patterns.length > 10) {
    mem.patterns = mem.patterns.slice(-10);
  }

  saveUserMemory(chatId, mem);
}

/**
 * Bulk-replace all patterns for a user (used by insight scheduler).
 */
export function replacePatterns(chatId: string, patterns: string[]): void {
  const mem = loadUserMemory(chatId);
  mem.patterns = patterns.slice(0, 15);
  saveUserMemory(chatId, mem);
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
    const factsText = mem.facts.map(f => `- ${f.text}`).join("\n");

    const response = await aiClient.messages.create({
      model: SONNET,
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

    const text = (response.content.find((b) => b.type === "text") as any)?.text || "";
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
