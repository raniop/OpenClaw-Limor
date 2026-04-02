/**
 * Post-setup verification script for OpenClaw.
 * Run: npm run verify
 *
 * Checks that everything is configured correctly before first run.
 * Works on macOS, Linux, and Windows.
 */
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "..");
const pass = (msg: string) => console.log(`  \u2705 ${msg}`);
const fail = (msg: string) => console.log(`  \u274c ${msg}`);
const warn = (msg: string) => console.log(`  \u26a0\ufe0f  ${msg}`);
const info = (msg: string) => console.log(`     ${msg}`);

let errors = 0;

console.log("");
console.log("  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
console.log("  \u2502  OpenClaw Setup Verification                \u2502");
console.log("  \u2502  \u05d1\u05d3\u05d9\u05e7\u05ea \u05d4\u05ea\u05e7\u05e0\u05d4                                  \u2502");
console.log("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
console.log("");

// 1. .env file
const envPath = join(ROOT, ".env");
if (existsSync(envPath)) {
  pass(".env file exists");
  const envContent = readFileSync(envPath, "utf-8");

  // Check API key
  const apiKeyMatch = envContent.match(/^ANTHROPIC_API_KEY=(.*)$/m);
  const apiKey = apiKeyMatch?.[1]?.trim() || "";
  if (apiKey && apiKey !== "sk-ant-..." && apiKey.startsWith("sk-ant-")) {
    pass("Anthropic API key is set");
  } else {
    fail("Anthropic API key is missing or placeholder");
    info("Get your key at: https://console.anthropic.com");
    errors++;
  }

  // Check bot name
  const botNameMatch = envContent.match(/^BOT_NAME_EN=(.*)$/m);
  const botName = botNameMatch?.[1]?.trim() || "";
  if (botName) {
    pass(`Bot name: ${botName}`);
  } else {
    warn("BOT_NAME_EN not set in .env (will use default: Limor)");
  }

  // Check owner name
  const ownerMatch = envContent.match(/^OWNER_NAME=(.*)$/m);
  const ownerName = ownerMatch?.[1]?.trim() || "";
  if (ownerName) {
    pass(`Owner: ${ownerName}`);
  } else {
    fail("OWNER_NAME is not set in .env");
    errors++;
  }

  // Check OWNER_CHAT_ID
  const chatIdMatch = envContent.match(/^OWNER_CHAT_ID=(.*)$/m);
  const chatId = chatIdMatch?.[1]?.trim() || "";
  if (chatId) {
    pass(`Owner chat ID: ${chatId}`);
  } else {
    warn("OWNER_CHAT_ID is not set yet (normal for first install)");
    info("");
    info("How to find your chat ID / \u05d0\u05d9\u05da \u05dc\u05de\u05e6\u05d5\u05d0 \u05d0\u05ea \u05d4-Chat ID:");
    info("  1. Start the bot:  npx pm2 start ecosystem.config.js");
    info("  2. Send any message to your bot on WhatsApp");
    info("  3. Check logs:     npx pm2 logs");
    info('  4. Look for:       [chat] from: XXXXXXXXX@c.us');
    info("  5. Copy the ID into .env:  OWNER_CHAT_ID=XXXXXXXXX@c.us");
    info("  6. Restart:        npx pm2 restart limor");
    info("");
  }

  // Check soul name and file
  const soulNameMatch = envContent.match(/^SOUL_NAME=(.*)$/m);
  const soulName = soulNameMatch?.[1]?.trim() || "limor";
  const soulPath = join(ROOT, "souls", `${soulName}.json`);
  if (existsSync(soulPath)) {
    pass(`Soul file: souls/${soulName}.json`);
  } else {
    fail(`Soul file not found: souls/${soulName}.json`);
    info("Run: npm run setup  to create it");
    errors++;
  }
} else {
  fail(".env file not found");
  info("Run: npm run setup  to create it");
  errors++;
}

// 2. Workspace identity
const soulMd = join(ROOT, "workspace", "identity", "SOUL.md");
if (existsSync(soulMd)) {
  pass("workspace/identity/SOUL.md exists");
} else {
  fail("workspace/identity/SOUL.md not found");
  info("Run: npm run setup  to create it");
  errors++;
}

// 3. Dependencies
const rootModules = join(ROOT, "node_modules");
if (existsSync(rootModules)) {
  pass("Root dependencies installed (node_modules/)");
} else {
  fail("Root dependencies not installed");
  info("Run: npm install");
  errors++;
}

const dashModules = join(ROOT, "dashboard", "node_modules");
if (existsSync(dashModules)) {
  pass("Dashboard dependencies installed (dashboard/node_modules/)");
} else {
  warn("Dashboard dependencies not installed");
  info("Run: cd dashboard && npm install");
  info("(Or use: npm run install-all)");
}

// 4. Build
const distIndex = join(ROOT, "dist", "index.js");
if (existsSync(distIndex)) {
  pass("Build exists (dist/index.js)");
} else {
  fail("Project not built yet");
  info("Run: npm run build");
  errors++;
}

// Summary
console.log("");
console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
if (errors === 0) {
  console.log("  \u2705 Everything looks good! Ready to start.");
  console.log("");
  console.log("  Next steps / \u05e6\u05e2\u05d3\u05d9\u05dd \u05d4\u05d1\u05d0\u05d9\u05dd:");
  console.log("    npx pm2 start ecosystem.config.js");
  console.log("    # Scan the QR code with WhatsApp > Linked Devices");
} else {
  console.log(`  \u274c ${errors} issue${errors > 1 ? "s" : ""} found. Fix the errors above and run again:`);
  console.log("    npm run verify");
}
console.log("");
