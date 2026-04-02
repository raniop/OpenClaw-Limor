/**
 * Update script for OpenClaw / Limor.
 * Run: npm run update
 *
 * Safely pulls the latest version from GitHub, preserving user config.
 * Works on macOS, Linux, and Windows.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import https from "https";

const ROOT = resolve(__dirname, "..");

function exec(cmd: string, silent = false): string {
  try {
    const result = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: silent ? "pipe" : ["pipe", "inherit", "inherit"],
    });
    return (result || "").trim();
  } catch (e: any) {
    if (silent) return "";
    throw e;
  }
}

function getLocalVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  return pkg.version || "0.0.0";
}

function getRepoUrl(): { owner: string; repo: string } | null {
  const remote = exec("git remote get-url origin", true);
  // Match https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (match) return { owner: match[1], repo: match[2] };
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

async function main() {
  console.log("");
  console.log("  ┌─────────────────────────────────────────────┐");
  console.log("  │  OpenClaw Updater / עדכון                    │");
  console.log("  └─────────────────────────────────────────────┘");
  console.log("");

  // Step 1: Get local version
  const localVersion = getLocalVersion();
  console.log(`  גרסה נוכחית / Current version: ${localVersion}`);

  // Step 2: Detect GitHub repo
  const repo = getRepoUrl();
  if (!repo) {
    console.log("  ❌ Could not detect GitHub remote. Is this a git repo?");
    process.exit(1);
  }
  console.log(`  Repo: ${repo.owner}/${repo.repo}`);

  // Step 3: Check for updates
  console.log("  בודק עדכונים... / Checking for updates...");
  const latestVersion = await fetchLatestTag(repo.owner, repo.repo);

  if (!latestVersion) {
    console.log("  ⚠️  לא נמצאו גרסאות מתויגות ב-GitHub.");
    console.log("     No tagged releases found on GitHub.");
    console.log("     מושך שינויים אחרונים... / Pulling latest changes...");
    console.log("");

    // Pull anyway — there might be untagged updates
    const hasChanges = exec("git status --porcelain", true);
    if (hasChanges) {
      console.log("  📦 שומר שינויים מקומיים... / Stashing local changes...");
      exec("git stash", true);
    }

    exec("git pull origin main");

    console.log("  📦 מתקין תלויות... / Installing dependencies...");
    exec("npm install");
    exec("cd dashboard && npm install");

    console.log("  🔨 בונה... / Building...");
    exec("npm run build");

    if (hasChanges) {
      exec("git stash pop", true);
    }

    console.log("");
    console.log("  ✅ העדכון הושלם! / Update complete!");
    console.log("     הריצו / Run:  npx pm2 restart limor");
    console.log("");
    process.exit(0);
  }

  // Step 4: Compare versions
  const cmp = compareVersions(latestVersion, localVersion);

  if (cmp <= 0) {
    console.log(`  ✅ הגרסה שלך מעודכנת! (${localVersion})`);
    console.log("     You're up to date!");
    console.log("");
    process.exit(0);
  }

  // Step 5: Update available
  console.log("");
  console.log(`  🔄 גרסה חדשה זמינה! / New version available!`);
  console.log(`     ${localVersion} → ${latestVersion}`);
  console.log("");
  console.log("  מעדכן... / Updating...");
  console.log("");

  // Stash local changes
  const hasChanges = exec("git status --porcelain", true);
  if (hasChanges) {
    console.log("  📦 שומר שינויים מקומיים... / Stashing local changes...");
    exec("git stash", true);
  }

  // Pull
  console.log("  ⬇️  מוריד עדכון... / Downloading update...");
  exec("git fetch origin");
  exec("git pull origin main");

  // Install deps
  console.log("  📦 מתקין תלויות... / Installing dependencies...");
  exec("npm install");
  exec("cd dashboard && npm install");

  // Build
  console.log("  🔨 בונה... / Building...");
  exec("npm run build");

  // Restore stashed changes
  if (hasChanges) {
    console.log("  📦 משחזר שינויים מקומיים... / Restoring local changes...");
    exec("git stash pop", true);
  }

  // Done
  const newVersion = getLocalVersion();
  console.log("");
  console.log("  ╔═════════════════════════════════════════════╗");
  console.log(`  ║  ✅ העדכון הושלם! / Update complete!        ║`);
  console.log(`  ║  גרסה / Version: ${newVersion.padEnd(27)}║`);
  console.log("  ╚═════════════════════════════════════════════╝");
  console.log("");
  console.log("  הפעילו מחדש / Restart:");
  console.log("    npx pm2 restart limor");
  console.log("");
}

main().catch((err) => {
  console.error("\n  ❌ Update failed:", err.message || err);
  console.log("  נסו שוב / Try again, or pull manually:");
  console.log("    git pull origin main && npm install && npm run build");
  console.log("");
  process.exit(1);
});
