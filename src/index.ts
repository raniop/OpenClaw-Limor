import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";
import { log } from "./logger";
import { existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { startDigestScheduler } from "./digest";

// Allow self-signed certificates (Control4 Director uses self-signed SSL)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

const client = createWhatsAppClient();

client.initialize();

// Start daily digest scheduler
startDigestScheduler();

// Graceful shutdown
process.on("SIGINT", async () => {
  log.systemShutdown();
  await client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log.systemShutdown();
  await client.destroy();
  process.exit(0);
});
