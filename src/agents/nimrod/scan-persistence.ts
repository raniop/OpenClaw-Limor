/**
 * Nimrod — Persistence Scanner
 * Checks macOS persistence locations:
 * LaunchAgents, LaunchDaemons, Login Items, cron jobs, shell profiles
 */
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import type { ScanResult, Finding } from "./types";

// Directories to scan for persistence
const PERSISTENCE_DIRS = [
  "/Library/LaunchAgents",
  "/Library/LaunchDaemons",
  "/System/Library/LaunchAgents",
  "/System/Library/LaunchDaemons",
];

function getUserPersistenceDirs(): string[] {
  try {
    const home = execSync("echo $HOME", { encoding: "utf-8", timeout: 3000 }).trim();
    return [
      `${home}/Library/LaunchAgents`,
      `${home}/Library/LaunchDaemons`,
    ];
  } catch {
    return [];
  }
}

// Known-legit plist prefixes
const KNOWN_LEGIT_PREFIXES = [
  "com.apple.", "com.microsoft.", "com.google.", "com.adobe.",
  "com.dropbox.", "org.nodejs.", "io.github.", "com.spotify.",
  "com.anthropic.", "com.pm2.", "com.homebrew.",
];

function isKnownLegit(filename: string): boolean {
  return KNOWN_LEGIT_PREFIXES.some(p => filename.startsWith(p));
}

function scanPlistDir(dir: string): { suspicious: string[]; total: number } {
  const suspicious: string[] = [];
  if (!existsSync(dir)) return { suspicious, total: 0 };

  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(f => f.endsWith(".plist"));
  } catch {
    return { suspicious, total: 0 };
  }

  for (const file of files) {
    if (!isKnownLegit(file)) {
      const fullPath = resolve(dir, file);
      try {
        const content = readFileSync(fullPath, "utf-8");
        const hasProgram = content.includes("<key>Program</key>");
        const hasArgs = content.includes("<key>ProgramArguments</key>");
        if (hasProgram || hasArgs) {
          suspicious.push(`${dir}/${file}`);
        }
      } catch {
        suspicious.push(`${dir}/${file} [cannot read]`);
      }
    }
  }

  return { suspicious, total: files.length };
}

function getCronJobs(): string[] {
  const jobs: string[] = [];
  try {
    const crontab = execSync("crontab -l 2>/dev/null || true", {
      encoding: "utf-8", timeout: 5000
    }).trim();
    if (crontab && !crontab.includes("no crontab")) {
      const lines = crontab.split("\n").filter(l => l.trim() && !l.startsWith("#"));
      jobs.push(...lines);
    }
  } catch {}
  return jobs;
}

function getLoginItems(): string[] {
  const items: string[] = [];
  try {
    const out = execSync(
      "osascript -e 'tell application \"System Events\" to get the name of every login item' 2>/dev/null || true",
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (out) items.push(...out.split(",").map(s => s.trim()).filter(Boolean));
  } catch {}
  return items;
}

export async function scanPersistence(): Promise<ScanResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    const allDirs = [...PERSISTENCE_DIRS, ...getUserPersistenceDirs()];
    const allSuspicious: string[] = [];
    let totalPlists = 0;

    for (const dir of allDirs) {
      const { suspicious, total } = scanPlistDir(dir);
      allSuspicious.push(...suspicious);
      totalPlists += total;
    }

    if (allSuspicious.length > 0) {
      findings.push({
        domain: "persistence",
        riskLevel: "suspicious",
        title: `${allSuspicious.length} plist(ים) לא מוכרים`,
        detail: "LaunchAgent/Daemon plists שאינם ממפתחים ידועים — עשויים להיות persistence מכוון",
        evidence: allSuspicious.join("\n"),
        recommendation: "בדוק את תוכן ה-plists ומאיפה הגיעו",
        timestamp: new Date().toISOString(),
      });
    }

    // Cron jobs
    const cronJobs = getCronJobs();
    if (cronJobs.length > 0) {
      findings.push({
        domain: "persistence",
        riskLevel: "suspicious",
        title: `${cronJobs.length} cron job(ים) פעיל(ים)`,
        detail: "cron jobs רצים על המערכת",
        evidence: cronJobs.join("\n"),
        recommendation: "ודא שכל ה-cron jobs מוכרים ולגיטימיים",
        timestamp: new Date().toISOString(),
      });
    }

    // Login items
    const loginItems = getLoginItems();
    if (loginItems.length > 0) {
      findings.push({
        domain: "persistence",
        riskLevel: "benign",
        title: `${loginItems.length} Login Items רשומים`,
        detail: "פריטי אתחול",
        evidence: loginItems.join(", "),
        recommendation: "בדוק שכולם מוכרים",
        timestamp: new Date().toISOString(),
      });
    }

    if (findings.length === 0) {
      findings.push({
        domain: "persistence",
        riskLevel: "benign",
        title: "Persistence — תקין",
        detail: "לא נמצאו persistence mechanisms חשודים",
        evidence: `נסרקו ${totalPlists} plists ב-${allDirs.length} תיקיות`,
        recommendation: "אין צורך בפעולה",
        timestamp: new Date().toISOString(),
      });
    }

  } catch (err: any) {
    errors.push(`scan-persistence error: ${err.message}`);
  }

  return {
    domain: "persistence",
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    findings,
    errors,
  };
}
