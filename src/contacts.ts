import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const CONTACTS_PATH = resolve(__dirname, "..", "memory", "contacts.json");

interface ContactEntry {
  chatId: string;
  name: string;
  aliases?: string[];
  phone: string;
  lastSeen: string;
}

type ContactsStore = Record<string, ContactEntry>; // keyed by chatId

// Simple Hebrew → phonetic key for fuzzy matching
function phoneticKey(name: string): string {
  const hebrewToLatin: Record<string, string> = {
    "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v",
    "ז": "z", "ח": "h", "ט": "t", "י": "i", "כ": "k", "ך": "k",
    "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s",
    "ע": "a", "פ": "p", "ף": "p", "צ": "ts", "ץ": "ts", "ק": "k",
    "ר": "r", "ש": "sh", "ת": "t",
  };
  return name.toLowerCase().split("").map((ch) => hebrewToLatin[ch] || ch).join("");
}

// Common Hebrew↔English name mapping for Israeli contacts
const NAME_MAP: Record<string, string[]> = {
  "amit": ["עמית"],
  "עמית": ["amit"],
  "yoni": ["יוני"],
  "יוני": ["yoni"],
  "rani": ["רני"],
  "רני": ["rani"],
  "eli": ["אלי"],
  "אלי": ["eli"],
  "dvora": ["דבורה"],
  "דבורה": ["dvora"],
  "guy": ["גיא"],
  "גיא": ["guy"],
  "golan": ["גולן"],
  "גולן": ["golan"],
  "avni": ["אבני"],
  "אבני": ["avni"],
  "ophir": ["אופיר"],
  "אופיר": ["ophir"],
  "david": ["דוד", "דויד"],
  "דוד": ["david"],
  "moshe": ["משה"],
  "משה": ["moshe"],
  "chen": ["חן"],
  "חן": ["chen"],
  "lior": ["ליאור"],
  "ליאור": ["lior"],
  "noa": ["נועה"],
  "נועה": ["noa"],
  "tal": ["טל"],
  "טל": ["tal"],
  "dan": ["דן"],
  "דן": ["dan"],
  "roi": ["רועי"],
  "רועי": ["roi"],
  "sharon": ["שרון"],
  "שרון": ["sharon"],
  "limor": ["לימור"],
  "לימור": ["limor"],
};

function translateName(name: string): string[] {
  const parts = name.toLowerCase().split(/\s+/);
  const results: string[] = [];
  // Try translating each part
  const translatedParts = parts.map(part => {
    const mapped = NAME_MAP[part];
    return mapped ? [part, ...mapped] : [part];
  });
  // Generate combinations
  if (translatedParts.length === 1) {
    results.push(...translatedParts[0]);
  } else if (translatedParts.length === 2) {
    for (const first of translatedParts[0]) {
      for (const second of translatedParts[1]) {
        results.push(`${first} ${second}`);
      }
    }
  }
  return results;
}

function loadContacts(): ContactsStore {
  if (!existsSync(CONTACTS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONTACTS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveContacts(contacts: ContactsStore): void {
  writeFileSync(CONTACTS_PATH, JSON.stringify(contacts, null, 2), "utf-8");
}

export function updateContact(chatId: string, name: string, phone: string): void {
  const contacts = loadContacts();
  const existing = contacts[chatId];
  const aliases = existing?.aliases || [];
  // Keep existing aliases + add new name variant if different
  if (existing && existing.name !== name && !aliases.includes(name)) {
    aliases.push(name);
  }
  contacts[chatId] = {
    chatId,
    name,
    aliases: aliases.length > 0 ? aliases : undefined,
    phone,
    lastSeen: new Date().toISOString(),
  };
  saveContacts(contacts);
}

export function addContactAlias(chatId: string, alias: string): void {
  const contacts = loadContacts();
  const contact = contacts[chatId];
  if (!contact) return;
  const aliases = contact.aliases || [];
  if (!aliases.includes(alias) && contact.name !== alias) {
    aliases.push(alias);
    contact.aliases = aliases;
    saveContacts(contacts);
  }
}

export function findContactByName(name: string): ContactEntry | null {
  const contacts = loadContacts();
  const searchLower = name.toLowerCase().trim();
  const searchVariants = [searchLower, ...translateName(searchLower)];
  const allNames = (c: ContactEntry) => [c.name, ...(c.aliases || [])].map(n => n.toLowerCase());

  // Try exact match first (name or alias, including translated variants)
  for (const c of Object.values(contacts)) {
    const cNames = allNames(c);
    for (const variant of searchVariants) {
      if (cNames.some(n => n === variant)) return c;
    }
  }
  // Try partial match with translated variants
  for (const c of Object.values(contacts)) {
    const cNames = allNames(c);
    for (const variant of searchVariants) {
      if (cNames.some(n => n.includes(variant) || variant.includes(n))) return c;
    }
  }
  // Phonetic fallback: compare Hebrew input to English names (or vice versa)
  const searchPhonetic = phoneticKey(searchLower);
  for (const c of Object.values(contacts)) {
    const nameParts = c.name.toLowerCase().split(/\s+/);
    // Check if phonetic key of search matches first name
    if (nameParts.some(part => phoneticKey(part) === searchPhonetic)) return c;
    // Check if phonetic key of first name matches search
    if (nameParts.some(part => searchPhonetic === phoneticKey(part))) return c;
  }
  return null;
}

export function findContactByPhone(phone: string): ContactEntry | null {
  const contacts = loadContacts();
  const clean = phone.replace(/\D/g, "");
  for (const c of Object.values(contacts)) {
    if (c.phone.replace(/\D/g, "").includes(clean) || clean.includes(c.phone.replace(/\D/g, ""))) return c;
  }
  return null;
}

export function getRecentContacts(limit: number = 10): ContactEntry[] {
  const contacts = loadContacts();
  return Object.values(contacts)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, limit);
}
