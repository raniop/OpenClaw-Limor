import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";
import { log } from "./logger";
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { startDigestScheduler } from "./digest";
import { startAmitScheduler } from "./agents/amit/amit-scheduler";
import { startHealthWebhook, stopHealthWebhook } from "./health-webhook";
import { startInsightScheduler } from "./insights/insight-scheduler";
import { startSocialGraphScheduler } from "./insights/social-graph-analyzer";
import { startCleanupScheduler } from "./insights/cleanup-scheduler";
import { initTelegramClient } from "./telegram/client";
import { startAutonomousAgents } from "./agents/autonomous";
import { startUpdateChecker } from "./updater/version-checker";

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

// Initialize Baileys WhatsApp connection
client.initialize().catch((err: any) => {
  console.error("[init] WhatsApp initialization failed:", err);
  process.exit(1);
});

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

// Initialize Telegram client (gramjs) for group reading
initTelegramClient().catch((err) =>
  console.error("[telegram] Init failed:", err.message)
);

// Start autonomous agent system (event bus + per-agent schedulers)
startAutonomousAgents();

// Start update checker — checks GitHub for new versions daily
startUpdateChecker();

// Graceful shutdown — no Chrome/Puppeteer to clean up (Baileys uses WebSocket)
let isShuttingDown = false;
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}, closing cleanly...`);
  log.systemShutdown();

  stopHealthWebhook();

  Promise.resolve(client.destroy())
    .catch(err => console.error("[shutdown] Error during destroy:", err))
    .finally(() => {
      console.log("[shutdown] Done, exiting.");
      process.exit(0);
    });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
