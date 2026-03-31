import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { resolve, join, relative, extname } from "path";

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

/** MIME type mapping by extension */
const MIME_MAP: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".txt":  "text/plain",
  ".md":   "text/plain",
  ".csv":  "text/csv",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".mp4":  "video/mp4",
  ".mp3":  "audio/mpeg",
  ".zip":  "application/zip",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const MAX_SEND_SIZE = 50 * 1024 * 1024; // 50MB — WhatsApp limit

export interface FileAsBase64Result {
  base64: string;
  mimetype: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Read a file from the files dir and return it as base64 + mimetype (for WhatsApp attachment).
 */
export function readFileAsBase64(filepath: string): FileAsBase64Result | { error: string } {
  let full: string;
  try {
    full = safePath(filepath);
  } catch (err: any) {
    return { error: err.message };
  }

  if (!existsSync(full)) return { error: `הקובץ "${filepath}" לא נמצא.` };

  const stat = statSync(full);
  if (stat.isDirectory()) return { error: `"${filepath}" היא תיקייה, לא קובץ.` };
  if (stat.size > MAX_SEND_SIZE) {
    return { error: `הקובץ גדול מדי (${formatSize(stat.size)}). מקסימום לשליחה: 50MB.` };
  }

  try {
    const buffer = readFileSync(full);
    const base64 = buffer.toString("base64");
    const ext = extname(filepath).toLowerCase();
    const mimetype = MIME_MAP[ext] || "application/octet-stream";
    const filename = filepath.split("/").pop() || filepath;
    return { base64, mimetype, filename, sizeBytes: stat.size };
  } catch (err: any) {
    return { error: `שגיאה בקריאת הקובץ: ${err.message}` };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
