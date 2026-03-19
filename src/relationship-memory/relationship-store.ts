/**
 * File-based relationship profile store.
 * Loads once into memory, persists on change.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type { RelationshipProfile } from "./relationship-types";

let cache: Map<string, RelationshipProfile> | null = null;

function ensureDir(): void {
  const dir = dirname(statePath("relationships.json"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadCache(): Map<string, RelationshipProfile> {
  if (cache) return cache;
  ensureDir();
  cache = new Map();
  const p = statePath("relationships.json");
  if (existsSync(p)) {
    try {
      const data: Record<string, RelationshipProfile> = JSON.parse(readFileSync(p, "utf-8"));
      for (const [key, profile] of Object.entries(data)) {
        cache.set(key, profile);
      }
    } catch {
      // Start fresh on parse error
    }
  }
  return cache;
}

function persist(): void {
  ensureDir();
  const data: Record<string, RelationshipProfile> = {};
  for (const [key, profile] of loadCache()) {
    data[key] = profile;
  }
  writeFileSync(statePath("relationships.json"), JSON.stringify(data, null, 2), "utf-8");
}

export function getProfile(chatId: string): RelationshipProfile | null {
  return loadCache().get(chatId) || null;
}

export function upsertProfile(profile: RelationshipProfile): void {
  loadCache().set(profile.chatId, profile);
  persist();
}

export function updateProfile(chatId: string, partial: Partial<RelationshipProfile>): RelationshipProfile | null {
  const existing = loadCache().get(chatId);
  if (!existing) return null;
  const updated = { ...existing, ...partial, updatedAt: new Date().toISOString() };
  loadCache().set(chatId, updated);
  persist();
  return updated;
}

export function listProfiles(): RelationshipProfile[] {
  return Array.from(loadCache().values());
}

export function deleteProfile(chatId: string): boolean {
  const deleted = loadCache().delete(chatId);
  if (deleted) persist();
  return deleted;
}
