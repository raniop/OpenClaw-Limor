import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";
import { log } from "./logger";

log.systemStarting();

validateConfig();

const client = createWhatsAppClient();

client.initialize();

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
