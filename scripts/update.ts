/**
 * Update script for Limor.
 * Run: npm run update
 *
 * Refreshes dependencies and rebuilds. Does NOT pull git — Limor is self-hosted.
 * Use `npm run update:baileys` to upgrade the Baileys WhatsApp library specifically.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(__dirname, "..");
const BAILEYS_PKG = "@whiskeysockets/baileys";

function exec(cmd: string, silent = false): string {
  try {
    const result = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 180_000,
      stdio: silent ? "pipe" : ["pipe", "inherit", "inherit"],
    });
    return (result || "").trim();
  } catch (e: any) {
    if (silent) return "";
    throw e;
  }
}

function getInstalledBaileys(): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "node_modules", BAILEYS_PKG, "package.json"), "utf-8"),
    );
    return pkg.version || null;
  } catch {
    return null;
  }
}

async function main() {
  const upgradeBaileys = process.argv.includes("--baileys");

  console.log("");
  console.log("  ┌─────────────────────────────────────────────┐");
  console.log("  │  Limor Updater                              │");
  console.log("  └─────────────────────────────────────────────┘");
  console.log("");

  if (upgradeBaileys) {
    const before = getInstalledBaileys();
    console.log(`  🔄 משדרג Baileys... (מותקן: v${before || "?"})`);
    exec(`npm i ${BAILEYS_PKG}@latest`);
    const after = getInstalledBaileys();
    console.log(`  ✅ Baileys: v${before || "?"} → v${after || "?"}`);
    console.log("");
  }

  console.log("  📦 מתקין תלויות... / Installing dependencies...");
  exec("npm install");
  exec("cd dashboard && npm install");

  console.log("  🔨 בונה... / Building...");
  exec("npm run build");

  console.log("");
  console.log("  ✅ בוצע! / Done!");
  console.log("     הפעילו מחדש / Restart:  npx pm2 restart limor");
  console.log("");
}

main().catch((err) => {
  console.error("\n  ❌ Update failed:", err.message || err);
  console.log("  נסו ידנית / Try manually:");
  console.log("    npm install && npm run build");
  console.log("");
  process.exit(1);
});
