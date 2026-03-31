import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";
import { log } from "./logger";
import { existsSync, readdirSync, unlinkSync, rmSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import { startDigestScheduler } from "./digest";
import { startAmitScheduler } from "./agents/amit/amit-scheduler";
import { startHealthWebhook, stopHealthWebhook } from "./health-webhook";
import { startInsightScheduler } from "./insights/insight-scheduler";
import { startSocialGraphScheduler } from "./insights/social-graph-analyzer";
import { startCleanupScheduler } from "./insights/cleanup-scheduler";

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

// Contacts are now in SQLite — syncContacts disabled (was writing orphans to JSON)
// import { syncContacts } from "./sync-contacts";
// const syncResult = syncContacts();
const syncResult = { added: 0, updated: 0 };
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
        try { unlinkSync(lockFile); } catch {}

        if (attempt < maxRetries) {
          console.log("[init] Retrying in 3 seconds...");
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        // Last resort: delete session entirely
        console.log("[init] Deleting session for fresh QR scan...");
        try { rmSync(sessionDir, { recursive: true, force: true }); } catch {}
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

// Start Amit — daily dependency update scheduler (03:00 Israel time)
startAmitScheduler();

// Start Apple Health webhook (receives data from iPhone Shortcut)
startHealthWebhook();

// Start insight scheduler — nightly behavioral pattern analysis (02:00 Israel time)
startInsightScheduler();

// Start social graph analyzer — nightly relationship inference (02:30 Israel time)
startSocialGraphScheduler();

// Start cleanup scheduler — nightly data maintenance (03:30 Israel time)
startCleanupScheduler();

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

  stopHealthWebhook();

  Promise.race([client.destroy(), timeout])
    .catch(err => console.error("[shutdown] Error during destroy:", err))
    .finally(() => {
      // Kill any leftover Chromium processes spawned by puppeteer
      try {
        execSync("pkill -f '.wwebjs_auth.*chrome' 2>/dev/null || true", { timeout: 3000 });
      } catch {}
      console.log("[shutdown] Done, exiting.");
      process.exit(0);
    });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
