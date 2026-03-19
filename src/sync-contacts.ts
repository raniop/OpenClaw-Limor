/**
 * Contact Sync — ensures contacts.json stays in sync with relationships.json.
 * Runs on startup and periodically. No AI calls.
 *
 * Rules:
 * 1. Every chatId in relationships.json must exist in contacts.json
 * 2. Names from relationships override stale contact names
 * 3. Manual contacts (manual_*) get upgraded when a real chatId is found in relationships
 * 4. Approved list stays in sync — every known contact with a real @lid gets approved
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "./state-dir";

interface ContactEntry {
  chatId: string;
  name: string;
  aliases?: string[];
  phone: string;
  lastSeen: string;
}

interface RelationshipProfile {
  chatId: string;
  name: string;
  relationshipType: string;
  importanceScore: number;
  lastInteractionAt?: string;
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  return fallback;
}

function saveJson(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Sync contacts.json with relationships.json.
 * Returns count of contacts added/updated.
 */
export function syncContacts(): { added: number; updated: number } {
  const contactsPath = statePath("contacts.json");
  const relPath = statePath("relationships.json");
  const approvedPath = statePath("approved.json");

  const contacts: Record<string, ContactEntry> = loadJson(contactsPath, {});
  const relationships: Record<string, RelationshipProfile> = loadJson(relPath, {});
  const approved: string[] = loadJson(approvedPath, []);

  let added = 0;
  let updated = 0;

  for (const [chatId, rel] of Object.entries(relationships)) {
    // Skip group chats
    if (chatId.endsWith("@g.us")) continue;

    const existing = contacts[chatId];
    if (!existing) {
      // New contact from relationships — add it
      contacts[chatId] = {
        chatId,
        name: rel.name,
        phone: "",
        lastSeen: rel.lastInteractionAt || new Date().toISOString(),
      };
      added++;
    } else {
      // Update name if relationship has a newer/different name
      if (rel.name && rel.name !== existing.name) {
        const aliases = existing.aliases || [];
        if (!aliases.includes(existing.name)) {
          aliases.push(existing.name);
        }
        existing.name = rel.name;
        if (aliases.length > 0) existing.aliases = aliases;
        updated++;
      }
      // Update lastSeen if relationship is newer
      if (rel.lastInteractionAt && rel.lastInteractionAt > existing.lastSeen) {
        existing.lastSeen = rel.lastInteractionAt;
        updated++;
      }
    }

    // Ensure real chatIds are in approved list
    if (chatId.endsWith("@lid") && !approved.includes(chatId)) {
      approved.push(chatId);
    }
  }

  // Upgrade manual contacts: if a manual_PHONE contact has a matching real chatId, merge
  const manualKeys = Object.keys(contacts).filter(k => k.startsWith("manual_"));
  for (const manualKey of manualKeys) {
    const manual = contacts[manualKey];
    // Find a real contact with matching phone
    const realEntry = Object.values(contacts).find(
      c => !c.chatId.startsWith("manual_") && c.phone && manual.phone && c.phone === manual.phone
    );
    if (realEntry) {
      // Merge aliases from manual into real
      const realAliases = realEntry.aliases || [];
      for (const alias of manual.aliases || []) {
        if (!realAliases.includes(alias) && alias !== realEntry.name) {
          realAliases.push(alias);
        }
      }
      if (realAliases.length > 0) realEntry.aliases = realAliases;
      if (manual.phone && !realEntry.phone) realEntry.phone = manual.phone;
      // Remove the manual entry
      delete contacts[manualKey];
      updated++;
    }
  }

  saveJson(contactsPath, contacts);
  saveJson(approvedPath, approved);

  return { added, updated };
}
