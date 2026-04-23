/**
 * Baileys version checker.
 * Polls npm registry for new @whiskeysockets/baileys releases on startup + every 24 hours.
 * Notifies the owner via WhatsApp when an update is available.
 */
import https from "https";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { config } from "../config";
import { getClient } from "../whatsapp";
import { queuedSendMessage } from "../whatsapp/send-queue";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const STATE_FILE = resolve(PROJECT_ROOT, "workspace", "state", "last-update-check.json");
const CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const BAILEYS_PKG = "@whiskeysockets/baileys";

function getInstalledBaileysVersion(): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(PROJECT_ROOT, "node_modules", BAILEYS_PKG, "package.json"), "utf-8"),
    );
    return pkg.version || null;
  } catch {
    return null;
  }
}

function fetchLatestBaileysVersion(): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const options = {
      hostname: "registry.npmjs.org",
      // `/latest` follows the `latest` dist-tag — including prereleases tagged as latest
      path: `/${encodeURIComponent(BAILEYS_PKG)}/latest`,
      headers: {
        "User-Agent": "Limor-Updater",
        Accept: "application/json",
      },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const body = JSON.parse(data);
            resolvePromise(body.version || null);
          } catch {
            resolvePromise(null);
          }
        });
      })
      .on("error", () => resolvePromise(null));
  });
}

function compareVersions(a: string, b: string): number {
  // Strip prerelease suffix for a coarse numeric compare, then tiebreak on the suffix string.
  const [baseA, preA = ""] = a.split("-", 2);
  const [baseB, preB = ""] = b.split("-", 2);
  const pa = baseA.split(".").map(Number);
  const pb = baseB.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  // Equal base: a version without prerelease > one with (1.0.0 > 1.0.0-rc.1)
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA === preB) return 0;
  return preA < preB ? -1 : 1;
}

function getLastNotifiedVersion(): string | null {
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      return state.lastNotifiedBaileysVersion || null;
    }
  } catch {}
  return null;
}

function saveLastNotifiedVersion(version: string): void {
  try {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({
        lastNotifiedBaileysVersion: version,
        checkedAt: new Date().toISOString(),
      }),
      "utf-8",
    );
  } catch {}
}

async function checkForUpdates(): Promise<void> {
  const installed = getInstalledBaileysVersion();
  if (!installed) {
    console.log("[updater] Baileys not installed — skipping check");
    return;
  }

  console.log(`[updater] Baileys v${installed} — checking npm for updates...`);

  const latest = await fetchLatestBaileysVersion();
  if (!latest) {
    console.log("[updater] Could not fetch latest Baileys version");
    return;
  }

  if (compareVersions(latest, installed) <= 0) {
    console.log(`[updater] Baileys up to date (v${installed})`);
    return;
  }

  console.log(`[updater] New Baileys version: v${latest} (installed: v${installed})`);

  const lastNotified = getLastNotifiedVersion();
  if (lastNotified === latest) {
    console.log("[updater] Already notified for this version, skipping");
    return;
  }

  const client = getClient();
  if (client && config.ownerChatId) {
    try {
      await queuedSendMessage(
        config.ownerChatId,
        `🔄 *עדכון Baileys זמין*\n\n` +
          `מותקן: v${installed}\n` +
          `חדש: v${latest}\n\n` +
          `Baileys זה החיבור ל-WhatsApp — עדכונים יכולים לתקן באגים אבל גם לשבור דברים.\n\n` +
          `לעדכון ידני:\n` +
          `\`npm i ${BAILEYS_PKG}@latest && npm run build\`\n` +
          `\`npx pm2 restart limor\``,
      );
      console.log("[updater] Notified owner about new Baileys version");
    } catch (err) {
      console.log("[updater] Failed to notify owner:", err);
    }
  }

  saveLastNotifiedVersion(latest);
}

let interval: ReturnType<typeof setInterval> | null = null;

export function startUpdateChecker(): void {
  setTimeout(() => {
    checkForUpdates().catch((err) =>
      console.log("[updater] Check failed:", err.message),
    );
  }, 60_000);

  interval = setInterval(() => {
    checkForUpdates().catch((err) =>
      console.log("[updater] Check failed:", err.message),
    );
  }, CHECK_INTERVAL);
}

export function stopUpdateChecker(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
