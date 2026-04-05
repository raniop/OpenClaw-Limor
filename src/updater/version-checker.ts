/**
 * Background version checker.
 * Checks GitHub for new releases on startup + every 24 hours.
 * Notifies the owner via WhatsApp when an update is available.
 */
import https from "https";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { config } from "../config";
import { sendTextMessage, isSocketConnected } from "../whatsapp/baileys-client";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const STATE_FILE = resolve(PROJECT_ROOT, "workspace", "state", "last-update-check.json");
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function getLocalVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getRepoInfo(): { owner: string; repo: string } | null {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch {}
  return null;
}

function fetchLatestTag(owner: string, repo: string): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/tags?per_page=1`,
      headers: { "User-Agent": "OpenClaw-Updater" },
    };

    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const tags = JSON.parse(data);
          if (Array.isArray(tags) && tags.length > 0) {
            resolve(tags[0].name.replace(/^v/, ""));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function getLastNotifiedVersion(): string | null {
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      return state.lastNotifiedVersion || null;
    }
  } catch {}
  return null;
}

function saveLastNotifiedVersion(version: string): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify({
      lastNotifiedVersion: version,
      checkedAt: new Date().toISOString(),
    }), "utf-8");
  } catch {}
}

async function checkForUpdates(): Promise<void> {
  const localVersion = getLocalVersion();
  const repo = getRepoInfo();

  if (!repo) {
    console.log("[updater] Could not detect GitHub remote, skipping update check");
    return;
  }

  console.log(`[updater] v${localVersion} — checking for updates...`);

  const latestVersion = await fetchLatestTag(repo.owner, repo.repo);
  if (!latestVersion) {
    console.log("[updater] No tagged releases found");
    return;
  }

  if (compareVersions(latestVersion, localVersion) <= 0) {
    console.log(`[updater] Up to date (v${localVersion})`);
    return;
  }

  // New version available!
  console.log(`[updater] New version available: v${latestVersion} (current: v${localVersion})`);

  // Don't notify if we already notified for this version
  const lastNotified = getLastNotifiedVersion();
  if (lastNotified === latestVersion) {
    console.log("[updater] Already notified for this version, skipping");
    return;
  }

  // Send WhatsApp notification to owner
  if (isSocketConnected() && config.ownerChatId) {
    try {
      await sendTextMessage(
        config.ownerChatId,
        `🔄 *גרסה חדשה זמינה!*\n\n` +
        `גרסה נוכחית: v${localVersion}\n` +
        `גרסה חדשה: v${latestVersion}\n\n` +
        `לעדכון, הריצו בטרמינל:\n` +
        `\`npm run update\`\n\n` +
        `או דאבל-קליק על Start OpenClaw`
      );
      console.log("[updater] Notified owner about new version");
    } catch (err) {
      console.log("[updater] Failed to notify owner:", err);
    }
  }

  saveLastNotifiedVersion(latestVersion);
}

let interval: ReturnType<typeof setInterval> | null = null;

export function startUpdateChecker(): void {
  // Check after a short delay (let WhatsApp connect first)
  setTimeout(() => {
    checkForUpdates().catch((err) =>
      console.log("[updater] Check failed:", err.message)
    );
  }, 60_000); // 1 minute after startup

  // Then check every 24 hours
  interval = setInterval(() => {
    checkForUpdates().catch((err) =>
      console.log("[updater] Check failed:", err.message)
    );
  }, CHECK_INTERVAL);
}

export function stopUpdateChecker(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
