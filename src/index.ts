import { validateConfig } from "./config";
import { createWhatsAppClient } from "./whatsapp";

console.log("🌟 Starting Limor (לימור)...");

validateConfig();

const client = createWhatsAppClient();

client.initialize();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down Limor...");
  await client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down Limor...");
  await client.destroy();
  process.exit(0);
});
