import { writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadWithFallback } from "./state-migration";
import { statePath } from "./state-dir";
import { config } from "./config";
import { getDb } from "./stores/sqlite-init";

const OLD_CONTACTS_PATH = resolve(__dirname, "..", "memory", "contacts.json");

interface ContactEntry {
  chatId: string;
  name: string;
  aliases?: string[];
  phone: string;
  lastSeen: string;
  relationship_type?: string;
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
  "limor": [config.botName],
  [config.botName]: ["limor"],
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

let _migrated = false;

function loadContacts(): ContactsStore {
  const db = getDb();

  // One-time migration: JSON → SQLite
  if (!_migrated) {
    _migrated = true;
    const count = (db.prepare("SELECT COUNT(*) as c FROM contacts").get() as any).c;
    if (count === 0) {
      // Try loading from JSON
      const jsonPath = statePath("contacts.json");
      const oldPath = OLD_CONTACTS_PATH;
      let jsonData: ContactsStore = {};
      try {
        if (existsSync(jsonPath)) jsonData = JSON.parse(readFileSync(jsonPath, "utf-8"));
        else if (existsSync(oldPath)) jsonData = JSON.parse(readFileSync(oldPath, "utf-8"));
      } catch {}
      if (Object.keys(jsonData).length > 0) {
        const insert = db.prepare("INSERT OR IGNORE INTO contacts (chat_id, name, phone, aliases, relationship_type, last_seen, source) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const tx = db.transaction(() => {
          for (const [key, c] of Object.entries(jsonData)) {
            if (!c || typeof c !== "object") continue;
            insert.run(key, c.name || "", c.phone || "", JSON.stringify(c.aliases || []), c.relationship_type || "", c.lastSeen || new Date().toISOString(), key.startsWith("manual_") ? "manual" : "auto");
          }
        });
        tx();
        console.log(`[contacts] Migrated ${Object.keys(jsonData).length} contacts from JSON to SQLite`);
      }
    }
  }

  // Load from SQLite
  const rows = db.prepare("SELECT * FROM contacts").all() as any[];
  const store: ContactsStore = {};
  for (const row of rows) {
    let aliases: string[] = [];
    try { aliases = JSON.parse(row.aliases || "[]"); } catch {}
    store[row.chat_id] = {
      chatId: row.chat_id,
      name: row.name,
      aliases: aliases.length > 0 ? aliases : undefined,
      phone: row.phone || "",
      lastSeen: row.last_seen || new Date().toISOString(),
      relationship_type: row.relationship_type || undefined,
    };
  }
  // Sync JSON file on first load (overwrite with SQLite truth)
  try {
    writeFileSync(statePath("contacts.json"), JSON.stringify(store, null, 2), "utf-8");
  } catch {}
  return store;
}

function saveContacts(contacts: ContactsStore): void {
  const db = getDb();
  const upsert = db.prepare(`INSERT OR REPLACE INTO contacts (chat_id, name, phone, aliases, relationship_type, last_seen, source) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    // Get all existing keys
    const existingKeys = new Set((db.prepare("SELECT chat_id FROM contacts").all() as any[]).map(r => r.chat_id));
    // Upsert all contacts
    for (const [key, c] of Object.entries(contacts)) {
      upsert.run(key, c.name, c.phone || "", JSON.stringify(c.aliases || []), c.relationship_type || "", c.lastSeen || new Date().toISOString(), key.startsWith("manual_") ? "manual" : "auto");
      existingKeys.delete(key);
    }
    // Delete contacts that were removed
    for (const key of existingKeys) {
      db.prepare("DELETE FROM contacts WHERE chat_id = ?").run(key);
    }
  });
  tx();
  // Also sync to JSON for dashboard compatibility
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

  // Auto-merge: look for an existing entry that matches by phone or name
  // This prevents duplicates when the same person messages from private chat, group, or was added manually
  const cleanPhone = isRealPhone ? phone : "";
  const nameLower = name.toLowerCase();
  const duplicateMatch = Object.entries(contacts).find(([key, c]) => {
    if (key === chatId) return false; // Skip self
    // Match by phone number
    if (cleanPhone && c.phone && c.phone === cleanPhone) return true;
    // Match by name — if existing entry has a phone, it's the authoritative record
    if (c.phone && [c.name, ...(c.aliases || [])].some(n => n.toLowerCase() === nameLower)) return true;
    // Match by first name — "Doron" matches "Doron Erel" if the existing has phone
    if (c.phone && c.name.toLowerCase().split(/\s+/)[0] === nameLower) return true;
    return false;
  });

  if (duplicateMatch) {
    const [dupeKey, dupeContact] = duplicateMatch;
    // If the existing entry has phone and we don't — just update lastSeen, don't create duplicate
    if (dupeContact.phone && !isRealPhone) {
      dupeContact.lastSeen = new Date().toISOString();
      if (name && !dupeContact.aliases?.includes(name) && dupeContact.name !== name) {
        dupeContact.aliases = [...(dupeContact.aliases || []), name];
      }
      saveContacts(contacts);
      return;
    }
    // Prefer the entry that has a phone number as primary
    const dupeHasPhone = !!dupeContact.phone;
    const newHasPhone = isRealPhone;
    const primaryKey = dupeHasPhone && !newHasPhone ? dupeKey :
      !dupeHasPhone && newHasPhone ? chatId :
      chatId.startsWith("manual_") ? dupeKey : chatId;
    const secondaryKey = primaryKey === chatId ? dupeKey : chatId;
    const primaryContact = primaryKey === chatId ? (existing || {}) : dupeContact;
    const secondaryContact = primaryKey === chatId ? dupeContact : (existing || {});

    const mergedAliases = [...new Set([
      ...(primaryContact.aliases || []),
      ...(secondaryContact.aliases || []),
      ...(primaryContact.name && secondaryContact.name && primaryContact.name !== secondaryContact.name
        ? [secondaryContact.name] : []),
      ...(name !== (primaryContact.name || secondaryContact.name) ? [name] : []),
    ])].filter(a => a && a !== (primaryContact.name || secondaryContact.name));

    contacts[primaryKey] = {
      chatId: primaryKey,
      name: primaryContact.name || secondaryContact.name || name,
      aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
      phone: primaryContact.phone || secondaryContact.phone || cleanPhone,
      relationship_type: primaryContact.relationship_type || secondaryContact.relationship_type,
      lastSeen: new Date().toISOString(),
    };
    if (secondaryKey !== primaryKey) {
      delete contacts[secondaryKey];
    }
    saveContacts(contacts);
    console.log(`[contacts] Auto-merged: ${secondaryKey} → ${primaryKey} (${contacts[primaryKey].name})`);
    return;
  }

  // No duplicate — handle phoneless contacts
  if (existing && !existing.phone && !isRealPhone) {
    // No phone anywhere — just update lastSeen
    existing.lastSeen = new Date().toISOString();
    saveContacts(contacts);
    return;
  }

  const aliases = existing?.aliases || [];
  if (existing && existing.name !== name && !aliases.includes(name)) {
    aliases.push(name);
  }
  contacts[chatId] = {
    ...existing,
    chatId,
    name: existing?.name || name, // Keep existing name if already set (e.g., Hebrew name over pushname)
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
