import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";
import { log } from "./logger";
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { startDigestScheduler } from "./digest";

log.systemStarting();

// Check if this is a restart after self-update
import { checkRestartFlag } from "./capabilities/sandbox";
const restartInfo = checkRestartFlag();
if (restartInfo) {
  console.log(`[self-update] Restarted after applying capability: ${restartInfo.capId} at ${restartInfo.appliedAt}`);
}

// Workspace verification
const wsDir = resolve(__dirname, "..", "workspace");
const stateDir = resolve(wsDir, "state");
const usersDir = resolve(wsDir, "memory", "users");
const identityFiles = ["identity/SOUL.md", "identity/VOICE.md", "identity/OPERATING_PRINCIPLES.md"];
const identityOk = identityFiles.every(f => existsSync(resolve(wsDir, f)));
const stateFiles = existsSync(stateDir) ? readdirSync(stateDir).filter(f => f.endsWith(".json")).length : 0;
const userMemFiles = existsSync(usersDir) ? readdirSync(usersDir).filter(f => f.endsWith(".md")).length : 0;
console.log(`[workspace] identity=${identityOk ? "OK" : "MISSING"} state=${stateFiles} files memory=${userMemFiles} users`);

validateConfig();

// Sync contacts with relationships on startup
import { syncContacts } from "./sync-contacts";
const syncResult = syncContacts();
if (syncResult.added > 0 || syncResult.updated > 0) {
  console.log(`[sync] Contacts synced: ${syncResult.added} added, ${syncResult.updated} updated`);
}

const client = createWhatsAppClient();

// Initialize with auto-retry on session corruption
async function initWithRetry(maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.initialize();
      return; // Success
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[init] Attempt ${attempt}/${maxRetries} failed: ${msg}`);

      // If session is corrupted, clean it and retry
      if (msg.includes("already running") || msg.includes("Execution context") || msg.includes("Protocol error")) {
        console.log("[init] Cleaning corrupted session...");
        const sessionDir = resolve(__dirname, "..", ".wwebjs_auth", "session");
        const lockFile = resolve(sessionDir, "SingletonLock");
        try { require("fs").unlinkSync(lockFile); } catch {}

        if (attempt < maxRetries) {
          console.log("[init] Retrying in 3 seconds...");
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        // Last resort: delete session entirely
        console.log("[init] Deleting session for fresh QR scan...");
        try { require("fs").rmSync(sessionDir, { recursive: true, force: true }); } catch {}
        await new Promise(r => setTimeout(r, 2000));
        try {
          await client.initialize();
          return;
        } catch (e: any) {
          console.error("[init] Final attempt failed:", e.message);
        }
      }

      if (attempt === maxRetries) {
        console.error("[init] All attempts failed. Bot will not start.");
        process.exit(1);
      }
    }
  }
}

initWithRetry();

// Start daily digest scheduler
startDigestScheduler();

// Graceful shutdown — close WhatsApp session and kill Chrome cleanly
let isShuttingDown = false;
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}, closing WhatsApp session cleanly...`);
  log.systemShutdown();

  const timeout = new Promise<void>(r => setTimeout(() => {
    console.error("[shutdown] Timeout waiting for client.destroy(), forcing exit");
    r();
  }, 8000));

  Promise.race([client.destroy(), timeout])
    .catch(err => console.error("[shutdown] Error during destroy:", err))
    .finally(() => {
      // Kill any leftover Chromium processes spawned by puppeteer
      try {
        const { execSync } = require("child_process");
        execSync("pkill -f '.wwebjs_auth.*chrome' 2>/dev/null || true", { timeout: 3000 });
      } catch {}
      console.log("[shutdown] Done, exiting.");
      process.exit(0);
    });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
