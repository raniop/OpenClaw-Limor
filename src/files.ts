import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { resolve, join, relative } from "path";

const FILES_DIR = resolve(__dirname, "..", "files");

// Ensure files directory exists
if (!existsSync(FILES_DIR)) mkdirSync(FILES_DIR, { recursive: true });

const MAX_READ_SIZE = 100 * 1024; // 100KB

/**
 * Security: ensure path stays within FILES_DIR
 */
function safePath(subpath: string): string {
  const full = resolve(FILES_DIR, subpath);
  if (!full.startsWith(FILES_DIR)) {
    throw new Error("גישה נדחתה: הנתיב מחוץ לתיקיית הקבצים");
  }
  return full;
}

export function listFiles(subdir?: string): string {
  const dir = subdir ? safePath(subdir) : FILES_DIR;
  if (!existsSync(dir)) return "התיקייה לא נמצאה.";

  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) return "התיקייה ריקה.";

    const lines: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        const type = stat.isDirectory() ? "📁" : "📄";
        const size = stat.isDirectory() ? "" : ` (${formatSize(stat.size)})`;
        const rel = relative(FILES_DIR, fullPath);
        lines.push(`${type} ${rel}${size}`);
      } catch {
        lines.push(`❓ ${entry}`);
      }
    }
    return lines.join("\n");
  } catch (err: any) {
    return `שגיאה: ${err.message}`;
  }
}

export function readFile(filepath: string): string {
  const full = safePath(filepath);
  if (!existsSync(full)) return `הקובץ "${filepath}" לא נמצא.`;

  const stat = statSync(full);
  if (stat.isDirectory()) return `"${filepath}" היא תיקייה, לא קובץ.`;
  if (stat.size > MAX_READ_SIZE) {
    return `הקובץ גדול מדי (${formatSize(stat.size)}). מקסימום ${formatSize(MAX_READ_SIZE)}.`;
  }

  try {
    return readFileSync(full, "utf-8");
  } catch {
    return `לא הצלחתי לקרוא את הקובץ "${filepath}".`;
  }
}

export function saveFile(filename: string, data: string | Buffer): string {
  const full = safePath(filename);

  // Create parent directory if needed
  const dir = resolve(full, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  try {
    if (Buffer.isBuffer(data)) {
      writeFileSync(full, data);
    } else {
      writeFileSync(full, data, "utf-8");
    }
    return `✅ הקובץ "${filename}" נשמר בהצלחה.`;
  } catch (err: any) {
    return `שגיאה בשמירה: ${err.message}`;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
