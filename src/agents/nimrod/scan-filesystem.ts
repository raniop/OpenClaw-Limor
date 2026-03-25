/**
 * Nimrod — Filesystem Scanner
 * Checks recently modified files, hidden files, unsigned binaries in key locations
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import type { ScanResult, Finding } from "./types";

// Directories to check for recent modifications (last 24h)
const WATCH_DIRS = [
  "/Library/LaunchAgents",
  "/Library/LaunchDaemons",
  "/etc",
  "/usr/local/bin",
  "/usr/bin",
];

function getRecentlyModified(dir: string, hoursBack = 24): string[] {
  if (!existsSync(dir)) return [];
  try {
    const out = execSync(
      `find "${dir}" -mtime -${Math.ceil(hoursBack / 24)} -type f 2>/dev/null | head -20`,
      { encoding: "utf-8", timeout: 10000 }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getHiddenFiles(): string[] {
  try {
    const home = execSync("echo $HOME", { encoding: "utf-8", timeout: 3000 }).trim();
    const out = execSync(
      `find "${home}" -maxdepth 3 -name ".*" -type f 2>/dev/null | grep -v ".DS_Store" | grep -v ".localized" | head -30`,
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function checkTmpExecutables(): string[] {
  const tmpDirs = ["/tmp", "/var/tmp", "/private/tmp"];
  const results: string[] = [];
  for (const dir of tmpDirs) {
    if (!existsSync(dir)) continue;
    try {
      const out = execSync(
        `find "${dir}" -type f -perm +111 2>/dev/null | head -10`,
        { encoding: "utf-8", timeout: 8000 }
      ).trim();
      if (out) results.push(...out.split("\n").filter(Boolean));
    } catch {}
  }
  return results;
}

function checkLargeUnknownFiles(): string[] {
  try {
    const home = execSync("echo $HOME", { encoding: "utf-8", timeout: 3000 }).trim();
    const out = execSync(
      `find "${home}" -maxdepth 4 -size +50M -not -path "*/Library/*" -not -path "*/.git/*" -type f 2>/dev/null | head -10`,
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function scanFilesystem(): Promise<ScanResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    // Recently modified in critical dirs
    const recentlyModified: string[] = [];
    for (const dir of WATCH_DIRS) {
      const files = getRecentlyModified(dir, 24);
      recentlyModified.push(...files);
    }

    if (recentlyModified.length > 0) {
      findings.push({
        domain: "filesystem",
        riskLevel: "suspicious",
        title: `${recentlyModified.length} קובץ/תיקייה שונה ב-24 שעות בתיקיות קריטיות`,
        detail: "שינויים בתיקיות מערכת קריטיות — עשויים להעיד על שינוי זדוני",
        evidence: recentlyModified.join("\n"),
        recommendation: "בדוק מי שינה קבצים אלה ומדוע",
        timestamp: new Date().toISOString(),
      });
    }

    // Executables in temp dirs
    const tmpExecs = checkTmpExecutables();
    if (tmpExecs.length > 0) {
      findings.push({
        domain: "filesystem",
        riskLevel: "high-risk",
        title: `${tmpExecs.length} קובץ הרצה ב-/tmp`,
        detail: "קבצים הניתנים להרצה בתיקיות /tmp — pattern נפוץ של malware",
        evidence: tmpExecs.join("\n"),
        recommendation: "בדוק מיידית — malware מניח לרוב executables ב-/tmp",
        timestamp: new Date().toISOString(),
      });
    }

    // Large unknown files in home dir
    const largeFiles = checkLargeUnknownFiles();
    if (largeFiles.length > 0) {
      findings.push({
        domain: "filesystem",
        riskLevel: "suspicious",
        title: `${largeFiles.length} קובץ גדול (>50MB) בתיקיית הבית`,
        detail: "קבצים גדולים לא בתיקיות ידועות",
        evidence: largeFiles.join("\n"),
        recommendation: "בדוק שהקבצים מוכרים (backup, media וכו')",
        timestamp: new Date().toISOString(),
      });
    }

    // Hidden files summary
    const hiddenFiles = getHiddenFiles();
    if (hiddenFiles.length > 20) {
      findings.push({
        domain: "filesystem",
        riskLevel: "suspicious",
        title: `${hiddenFiles.length} קבצים מוסתרים בתיקיית הבית`,
        detail: "כמות חריגה של קבצים מוסתרים",
        evidence: hiddenFiles.slice(0, 15).join("\n") + (hiddenFiles.length > 15 ? "\n..." : ""),
        recommendation: "בדוק את הקבצים המוסתרים הלא מוכרים",
        timestamp: new Date().toISOString(),
      });
    }

    if (findings.length === 0) {
      findings.push({
        domain: "filesystem",
        riskLevel: "benign",
        title: "מערכת קבצים — תקין",
        detail: "לא נמצאו קבצים חשודים",
        evidence: `בדיקה בוצעה על ${WATCH_DIRS.length} תיקיות קריטיות`,
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: any) {
    errors.push(`scan-filesystem error: ${err.message}`);
  }

  return {
    domain: "filesystem",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    errors,
  };
}
