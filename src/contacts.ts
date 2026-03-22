import { writeFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";
import { statePath } from "./state-dir";

const OLD_CONTACTS_PATH = resolve(__dirname, "..", "memory", "contacts.json");

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
  "eyal": ["אייל"],
  "אייל": ["eyal"],
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
  return loadWithFallback<ContactsStore>(statePath("contacts.json"), OLD_CONTACTS_PATH, {});
}

function saveContacts(contacts: ContactsStore): void {
  writeFileSync(statePath("contacts.json"), JSON.stringify(contacts, null, 2), "utf-8");
}

export function updateContact(chatId: string, name: string, phone: string): void {
  // Don't add group chats to contacts — only personal chats
  if (chatId.endsWith("@g.us")) return;

  // A real phone is Israeli format 972XXXXXXXXX (9-10 digits after 972)
  const isRealPhone = !!phone && /^972\d{8,9}$/.test(phone);

  const contacts = loadContacts();
  const existing = contacts[chatId];

  // Don't create new contacts without a real phone number
  if (!existing && !isRealPhone) return;

  // If existing contact already has a real phone, just update lastSeen + aliases
  const existingHasRealPhone = existing?.phone && /^972\d{8,9}$/.test(existing.phone);

  const aliases = existing?.aliases || [];
  if (existing && existing.name !== name && !aliases.includes(name)) {
    aliases.push(name);
  }
  contacts[chatId] = {
    chatId,
    name,
    aliases: aliases.length > 0 ? aliases : undefined,
    phone: isRealPhone ? phone : (existing?.phone || ""),
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

  // Sort contacts: prefer personal chatIds (not groups, not manual) over group aliases
  const sorted = Object.values(contacts).sort((a, b) => {
    const aIsPersonal = !a.chatId.endsWith("@g.us") && !a.chatId.startsWith("manual_") ? 0 : 1;
    const bIsPersonal = !b.chatId.endsWith("@g.us") && !b.chatId.startsWith("manual_") ? 0 : 1;
    return aIsPersonal - bIsPersonal;
  });

  // 1. Try exact full name match first
  for (const c of sorted) {
    const cNames = allNames(c);
    for (const variant of searchVariants) {
      if (cNames.some(n => n === variant)) return c;
    }
  }

  // 2. Try exact first-name match (split full name, match first word exactly)
  for (const c of sorted) {
    const firstName = c.name.toLowerCase().split(/\s+/)[0];
    const firstNameAliases = (c.aliases || []).map(a => a.toLowerCase().split(/\s+/)[0]);
    const allFirstNames = [firstName, ...firstNameAliases];
    for (const variant of searchVariants) {
      if (allFirstNames.some(fn => fn === variant)) return c;
    }
  }

  // 3. Partial match — but require minimum 3 chars to avoid "אלי" matching "אייל"
  if (searchLower.length >= 3) {
    for (const c of sorted) {
      const cNames = allNames(c);
      for (const variant of searchVariants) {
        if (variant.length >= 3 && cNames.some(n => n.includes(variant) || variant.includes(n))) return c;
      }
    }
  }

  // 4. Phonetic fallback — only for searches >= 3 chars
  if (searchLower.length >= 3) {
    const searchPhonetic = phoneticKey(searchLower);
    for (const c of sorted) {
      const nameParts = c.name.toLowerCase().split(/\s+/);
      if (nameParts.some(part => phoneticKey(part) === searchPhonetic)) return c;
    }
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

export function addManualContact(name: string, phone: string, notes?: string): string {
  const contacts = loadContacts();
  const cleanPhone = phone.replace(/\D/g, "");

  // Check if contact already exists by phone
  let existing = cleanPhone
    ? Object.entries(contacts).find(([, c]) => c.phone.replace(/\D/g, "") === cleanPhone)
    : undefined;

  // Also check by name (for contacts added without phone)
  if (!existing) {
    const nameLower = name.toLowerCase();
    existing = Object.entries(contacts).find(([, c]) => {
      const allNames = [c.name, ...(c.aliases || [])].map(n => n.toLowerCase());
      return allNames.includes(nameLower);
    });
  }

  if (existing) {
    const [existingKey, existingContact] = existing;
    let changed = false;
    // Update phone if missing
    if (cleanPhone && !existingContact.phone) {
      existingContact.phone = cleanPhone;
      changed = true;
    }
    // Update name if different
    if (existingContact.name !== name) {
      const aliases = existingContact.aliases || [];
      if (!aliases.includes(existingContact.name)) aliases.push(existingContact.name);
      existingContact.name = name;
      existingContact.aliases = aliases.length > 0 ? aliases : undefined;
      changed = true;
    }
    // If phone was added and chatId is a non-phone manual_, migrate to phone-based key
    if (cleanPhone && existingKey.startsWith("manual_") && !existingKey.includes(cleanPhone)) {
      const newKey = `manual_${cleanPhone}`;
      contacts[newKey] = { ...existingContact, chatId: newKey };
      delete contacts[existingKey];
      changed = true;
    }
    if (changed) {
      saveContacts(contacts);
      return `עדכנתי את ${name} (${phone})`;
    }
    return `${name} (${phone}) כבר קיים`;
  }

  // Create with placeholder chatId
  const placeholderChatId = `manual_${cleanPhone}`;
  contacts[placeholderChatId] = {
    chatId: placeholderChatId,
    name,
    phone: cleanPhone,
    lastSeen: new Date().toISOString(),
  };
  saveContacts(contacts);
  return `✅ נשמר: ${name} (${phone})`;
}

/**
 * Remove a contact by name. Returns a status message.
 */
export function removeContact(name: string): string {
  const contacts = loadContacts();
  const contact = findContactByName(name);
  if (!contact) return `❌ לא מצאתי איש קשר בשם "${name}"`;

  // Find the key in contacts store
  const key = Object.keys(contacts).find(k => contacts[k].name === contact.name || k === contact.chatId);
  if (!key) return `❌ לא מצאתי איש קשר בשם "${name}" במאגר`;

  const removed = contacts[key];
  delete contacts[key];
  saveContacts(contacts);
  return `✅ מחקתי את ${removed.name}${removed.phone ? ` (${removed.phone})` : ""} מאנשי הקשר.`;
}

export function listAllContacts(): string {
  const contacts = loadContacts();
  const entries = Object.values(contacts)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
  if (entries.length === 0) return "אין אנשי קשר שמורים.";
  return entries
    .map((c) => {
      const aliases = c.aliases?.length ? ` (${c.aliases.join(", ")})` : "";
      return `- ${c.name}${aliases}: ${c.phone}`;
    })
    .join("\n");
}

export function getRecentContacts(limit: number = 10): ContactEntry[] {
  const contacts = loadContacts();
  return Object.values(contacts)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, limit);
}
