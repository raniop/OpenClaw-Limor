/**
 * Claude Code integration — uses the Claude CLI to implement capability specs.
 * Runs Claude Code in a git worktree with the spec as the prompt.
 */
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { createWorktree, getDiff, applyWorktree, cleanupWorktree } from "./sandbox";
import { getSpec } from "./spec-store";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const WORKTREES_DIR = join(PROJECT_ROOT, ".worktrees");

/**
 * Find the latest Claude CLI binary dynamically.
 * Claude Code updates change the version directory, so we find the latest.
 */
function findClaudeCli(): string {
  const baseDir = join(
    process.env.HOME || "/Users/raniophir",
    "Library/Application Support/Claude/claude-code"
  );
  try {
    const { readdirSync } = require("fs");
    const versions = readdirSync(baseDir)
      .filter((d: string) => /^\d+\.\d+\.\d+$/.test(d))
      .sort((a: string, b: string) => {
        const pa = a.split(".").map(Number);
        const pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if (pa[i] !== pb[i]) return pb[i] - pa[i];
        }
        return 0;
      });
    if (versions.length > 0) {
      const cliPath = join(baseDir, versions[0], "claude");
      if (existsSync(cliPath)) return cliPath;
    }
  } catch {}
  // Fallback: try PATH
  try {
    const { execSync } = require("child_process");
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {}
  return join(baseDir, "2.1.76", "claude"); // last known good
}

/**
 * Run Claude Code to implement a capability spec.
 * Returns a promise that resolves with the implementation result.
 */
export async function implementCapability(capId: string, onProgress?: (msg: string) => void): Promise<string> {
  // Get the spec
  const spec = getSpec(capId);
  if (!spec) return `❌ לא מצאתי capability spec: ${capId}`;
  if (spec.status !== "approved") return `❌ הספציפיקציה ${capId} לא אושרה. סטטוס: ${spec.status}`;

  // Create worktree
  const wtResult = createWorktree(capId);
  if (onProgress) onProgress(`📂 Worktree created: ${capId}`);

  const worktreePath = join(WORKTREES_DIR, capId);
  if (!existsSync(worktreePath)) return `❌ Failed to create worktree: ${wtResult}`;

  // Build the prompt for Claude Code
  const prompt = buildPrompt(spec);
  if (onProgress) onProgress(`🤖 Starting Claude Code...`);

  try {
    // Run Claude Code in the worktree
    const output = await runClaudeCode(worktreePath, prompt);
    if (onProgress) onProgress(`✅ Claude Code finished`);

    // Get the diff
    const diff = getDiff(capId);
    const diffLines = diff.split("\n");
    const diffSummary = diffLines.slice(0, 30).join("\n");
    const lineCount = diffLines.length;

    // Auto-apply if requested by owner
    if (spec.autoApply) {
      if (onProgress) onProgress(`🔨 מחיל שינויים אוטומטית...`);
      const applyResult = applyWorktree(capId);
      return `🎉 **${spec.title}** — מומש והוחל!\n\n📝 ${lineCount} שורות שונו\n${applyResult}`;
    }

    return `✅ Claude Code סיים לעבוד על: **${spec.title}**\n\n` +
      `📝 שינויים (${lineCount} שורות):\n\`\`\`\n${diffSummary}\n\`\`\`\n\n` +
      `להחיל את השינויים? ענה: *החלי ${capId}*\n` +
      `לבטל: *בטלי ${capId}*`;
  } catch (err: any) {
    // Cleanup on failure
    try { cleanupWorktree(capId); } catch {}
    return `❌ Claude Code נכשל: ${err.message}`;
  }
}

function buildPrompt(spec: any): string {
  return `You are implementing a capability for the Limor WhatsApp AI assistant bot.

## Capability: ${spec.title}

## Problem
${spec.problem}

## Why Current System Can't Do It
${spec.whyCurrentSystemCantDoIt}

## Proposed Solution
${spec.proposedSolution}

## Affected Modules
${spec.affectedModules?.join(", ") || "TBD"}

## Level
${spec.level}

## Instructions
1. Read the relevant source files to understand the current architecture
2. Implement the minimum viable solution — focus on ONE thing, do it well
3. Follow existing patterns (look at how other tools/integrations are built)
4. Add the new tool definitions, handlers, and any service modules needed
5. Make sure TypeScript compiles cleanly (run: npm run build)
6. Do NOT break existing behavior
7. Keep it simple and production-minded
8. If the task is too large for one session, implement the MOST IMPORTANT part only
9. NEVER use 'tsc' directly — always use 'npm run build'

## Important project structure
- src/ai/tools/ — tool definition arrays (one file per category)
- src/ai/handle-tool-call.ts — tool execution dispatcher
- src/ai/send-message.ts — imports tool arrays, assembles for Claude API
- src/ai/tools/index.ts — barrel re-export of all tool arrays
- src/config.ts — env vars and configuration
- workspace/policies/ — behavioral policies loaded into prompt
- .env — API keys and secrets (add new vars here)

After implementing, run: npx tsc
Fix any compilation errors before finishing.`;
}

/**
 * Run Claude Code CLI in headless mode.
 */
function runClaudeCode(cwd: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "--print", prompt,
      "--output-format", "text",
      "--max-turns", "50",
    ];

    const claudeCli = findClaudeCli();
    console.log(`[claude-code] Starting in ${cwd} (CLI: ${claudeCli})`);

    const proc = spawn(claudeCli, args, {
      cwd,
      timeout: 900_000, // 15 minutes (large changes need time)
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "limor-bot" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      console.log(`[claude-code] Finished with code ${code}`);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude Code exited with ${code}: ${stderr.substring(0, 500)}`));
      }
    });

    proc.on("error", (err: Error) => {
      reject(err);
    });
  });
}
