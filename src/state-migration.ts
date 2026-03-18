/**
 * Shared state path migration helper.
 * Handles fallback from old paths to new workspace/state/ paths.
 * Rules:
 * - If new file exists, use it (primary)
 * - If new file missing but old file exists, copy old → new on first read
 * - If both exist, prefer new (old is stale)
 * - Never delete old files
 * - Log when migration happens
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const migrated = new Set<string>();

/**
 * Load JSON from new path, falling back to old path if needed.
 * Migrates old → new on first read if new doesn't exist.
 */
export function loadWithFallback<T>(
  newPath: string,
  oldPath: string,
  defaultValue: T
): T {
  // Ensure directory exists
  const dir = dirname(newPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Primary: read from new path
  if (existsSync(newPath)) {
    try {
      const data = JSON.parse(readFileSync(newPath, "utf-8"));

      // One-time: check if old path has more data and merge if needed
      if (!migrated.has(newPath) && existsSync(oldPath)) {
        migrated.add(newPath);
        try {
          const oldData = JSON.parse(readFileSync(oldPath, "utf-8"));
          const merged = mergeIfNeeded(data, oldData, newPath);
          if (merged !== null) {
            writeFileSync(newPath, JSON.stringify(merged, null, 2), "utf-8");
            console.log(`[migration] Merged data from ${oldPath} → ${newPath}`);
            return merged as T;
          }
        } catch {}
      }

      return data as T;
    } catch {
      return defaultValue;
    }
  }

  // Fallback: migrate from old path
  if (existsSync(oldPath)) {
    try {
      const data = JSON.parse(readFileSync(oldPath, "utf-8"));
      writeFileSync(newPath, JSON.stringify(data, null, 2), "utf-8");
      console.log(`[migration] Migrated ${oldPath} → ${newPath}`);
      migrated.add(newPath);
      return data as T;
    } catch {
      return defaultValue;
    }
  }

  return defaultValue;
}

/**
 * Merge old data into new if old has entries that new is missing.
 * Returns merged data, or null if no merge needed.
 */
function mergeIfNeeded(newData: any, oldData: any, path: string): any | null {
  // Arrays: merge unique entries
  if (Array.isArray(newData) && Array.isArray(oldData)) {
    const newSet = new Set(newData.map(String));
    const missing = oldData.filter((item: any) => !newSet.has(String(item)));
    if (missing.length > 0) {
      return [...newData, ...missing];
    }
    return null;
  }

  // Objects: merge missing keys
  if (typeof newData === "object" && typeof oldData === "object" && !Array.isArray(newData)) {
    const newKeys = new Set(Object.keys(newData));
    const missingKeys = Object.keys(oldData).filter((k) => !newKeys.has(k));
    if (missingKeys.length > 0) {
      const merged = { ...newData };
      for (const k of missingKeys) {
        merged[k] = oldData[k];
      }
      return merged;
    }
    return null;
  }

  return null;
}
