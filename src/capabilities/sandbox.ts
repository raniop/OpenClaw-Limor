/**
 * Sandboxed code execution via git worktrees.
 * All code changes happen in an isolated copy of the repo.
 * Nothing touches production until explicitly applied with owner approval.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const WORKTREES_DIR = join(PROJECT_ROOT, ".worktrees");
const RESTART_FLAG = join(PROJECT_ROOT, ".restart-after-update");

// Dangerous commands that should never run
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s/,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\{/,  // fork bomb
  />\s*\/dev\/sd/,
  /shutdown/,
  /reboot/,
];

const COMMAND_TIMEOUT = 60_000; // 60 seconds

function getWorktreePath(capId: string): string {
  return join(WORKTREES_DIR, capId);
}

function sanitizeCommand(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return null;
    }
  }
  return command;
}

function execInDir(dir: string, command: string, timeoutMs = COMMAND_TIMEOUT): string {
  try {
    const result = execSync(command, {
      cwd: dir,
      timeout: timeoutMs,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, NODE_ENV: "development" },
    });
    return result;
  } catch (err: any) {
    // Return both stdout and stderr on failure
    const stdout = err.stdout || "";
    const stderr = err.stderr || "";
    return `EXIT CODE: ${err.status || "unknown"}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
  }
}

/**
 * Create a git worktree for a capability.
 */
export function createWorktree(capId: string): string {
  if (!existsSync(WORKTREES_DIR)) mkdirSync(WORKTREES_DIR, { recursive: true });

  const worktreePath = getWorktreePath(capId);
  if (existsSync(worktreePath)) {
    return `Worktree already exists: ${worktreePath}`;
  }

  const branchName = `limor/${capId}`;
  const result = execInDir(PROJECT_ROOT, `git worktree add "${worktreePath}" -b "${branchName}" HEAD`);

  // Install node_modules in worktree (symlink for speed)
  if (existsSync(worktreePath)) {
    try {
      execInDir(worktreePath, `ln -sf "${join(PROJECT_ROOT, 'node_modules')}" node_modules`);
    } catch {}
  }

  console.log(`[sandbox] Created worktree: ${capId}`);
  return result || `✅ Worktree created: ${capId}`;
}

/**
 * Run a shell command inside a worktree.
 */
export function runInWorktree(capId: string, command: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `❌ Worktree not found: ${capId}. Create it first.`;
  }

  const sanitized = sanitizeCommand(command);
  if (!sanitized) {
    return `❌ Command blocked for safety: ${command}`;
  }

  console.log(`[sandbox] Running in ${capId}: ${command.substring(0, 100)}`);
  return execInDir(worktreePath, sanitized);
}

/**
 * Read a file from the worktree (or from production if no worktree).
 */
export function readProjectFile(path: string, capId?: string): string {
  const base = capId ? getWorktreePath(capId) : PROJECT_ROOT;
  const fullPath = resolve(base, path);

  // Security: must be within the project
  if (!fullPath.startsWith(base)) {
    return `❌ Path outside project: ${path}`;
  }

  if (!existsSync(fullPath)) {
    return `❌ File not found: ${path}`;
  }

  try {
    return readFileSync(fullPath, "utf-8");
  } catch (err: any) {
    return `❌ Cannot read: ${err.message}`;
  }
}

/**
 * Write a file in the worktree.
 */
export function writeProjectFile(capId: string, path: string, content: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `❌ Worktree not found: ${capId}. Create it first.`;
  }

  const fullPath = resolve(worktreePath, path);
  if (!fullPath.startsWith(worktreePath)) {
    return `❌ Path outside worktree: ${path}`;
  }

  try {
    // Create parent directories
    const dir = resolve(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    writeFileSync(fullPath, content, "utf-8");
    console.log(`[sandbox] Wrote file in ${capId}: ${path}`);
    return `✅ File written: ${path}`;
  } catch (err: any) {
    return `❌ Cannot write: ${err.message}`;
  }
}

/**
 * Build and test in the worktree.
 */
export function buildAndTest(capId: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `❌ Worktree not found: ${capId}`;
  }

  console.log(`[sandbox] Building and testing in ${capId}...`);

  // Build
  const buildResult = execInDir(worktreePath, "npx tsc 2>&1", 120_000);
  if (buildResult.includes("error TS")) {
    return `❌ Build failed:\n${buildResult}`;
  }

  return `✅ Build successful!\n${buildResult}`;
}

/**
 * Get diff of changes in the worktree vs main.
 */
export function getDiff(capId: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `❌ Worktree not found: ${capId}`;
  }

  // Stage all changes first to include new files
  execInDir(worktreePath, "git add -A");
  const diff = execInDir(worktreePath, "git diff --cached --stat && echo '---' && git diff --cached");
  return diff || "No changes detected.";
}

/**
 * Apply worktree changes: commit in worktree, merge to main, cleanup, restart.
 */
export function applyWorktree(capId: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `❌ Worktree not found: ${capId}`;
  }

  try {
    // First: build in worktree to verify changes compile
    console.log(`[sandbox] Building in worktree ${capId} before applying...`);
    const testBuild = execInDir(worktreePath, "npm run build 2>&1", 120_000);
    if (testBuild.includes("error TS") || testBuild.includes("command not found")) {
      console.error(`[sandbox] Build failed in worktree — NOT applying: ${testBuild.substring(0, 200)}`);
      return `❌ Build failed in worktree — changes NOT applied:\n${testBuild.substring(0, 300)}`;
    }

    // Commit changes in worktree
    execInDir(worktreePath, "git add -A");
    execInDir(worktreePath, `git commit -m "feat: ${capId} — self-implemented capability" --allow-empty`);

    // Merge into main
    const branchName = `limor/${capId}`;
    execInDir(PROJECT_ROOT, `git merge "${branchName}" --no-edit`);

    // Cleanup worktree (force, ignore errors)
    try {
      execInDir(PROJECT_ROOT, `git worktree remove "${worktreePath}" --force`);
    } catch {}
    try {
      execInDir(PROJECT_ROOT, `git branch -D "${branchName}"`);
    } catch {}

    // Ensure node_modules exist (worktree cleanup can break symlinks)
    if (!existsSync(resolve(PROJECT_ROOT, "node_modules", ".bin", "tsc"))) {
      console.log("[sandbox] node_modules damaged, reinstalling...");
      execInDir(PROJECT_ROOT, "npm install", 120_000);
    }

    // Rebuild production
    const buildResult = execInDir(PROJECT_ROOT, "npm run build 2>&1", 120_000);
    if (buildResult.includes("error TS")) {
      console.error(`[sandbox] Production build failed after merge: ${buildResult.substring(0, 200)}`);
      return `❌ Production build failed after merge:\n${buildResult.substring(0, 300)}`;
    }

    // Write restart flag
    writeFileSync(RESTART_FLAG, JSON.stringify({ capId, appliedAt: new Date().toISOString() }));

    console.log(`[sandbox] Applied ${capId} — restarting via pm2...`);

    // Restart via pm2 (graceful) — if pm2 is not available, fallback to process.exit
    setTimeout(() => {
      try {
        const { execSync } = require("child_process");
        execSync("npx pm2 restart limor", { cwd: PROJECT_ROOT, timeout: 10_000 });
      } catch {
        process.exit(0); // Fallback: pm2 will auto-restart
      }
    }, 2000);

    return `✅ Changes applied! Building and restarting...\nCapability: ${capId}`;
  } catch (err: any) {
    return `❌ Apply failed: ${err.message}`;
  }
}

/**
 * Cleanup a worktree without applying.
 */
export function cleanupWorktree(capId: string): string {
  const worktreePath = getWorktreePath(capId);
  if (!existsSync(worktreePath)) {
    return `Worktree ${capId} doesn't exist.`;
  }

  try {
    const branchName = `limor/${capId}`;
    execInDir(PROJECT_ROOT, `git worktree remove "${worktreePath}" --force`);
    try { execInDir(PROJECT_ROOT, `git branch -D "${branchName}"`); } catch {}
    console.log(`[sandbox] Cleaned up worktree: ${capId}`);
    return `✅ Worktree ${capId} cleaned up.`;
  } catch (err: any) {
    return `❌ Cleanup failed: ${err.message}`;
  }
}

/**
 * Check if bot was restarted after a self-update.
 */
export function checkRestartFlag(): { capId: string; appliedAt: string } | null {
  if (existsSync(RESTART_FLAG)) {
    try {
      const data = JSON.parse(readFileSync(RESTART_FLAG, "utf-8"));
      const { unlinkSync } = require("fs");
      unlinkSync(RESTART_FLAG);
      return data;
    } catch {}
  }
  return null;
}
