import { NextRequest, NextResponse } from "next/server";
import { execSync, spawn } from "child_process";
import { resolve } from "path";
import { existsSync, appendFileSync } from "fs";
import { isLimorRunning } from "@/lib/data";

const BOT_DIR = resolve(process.cwd(), "..");
const LOG_PATH = resolve(BOT_DIR, "workspace", "state", "limor.log");

function findBotPid(): number | null {
  try {
    const result = execSync("pgrep -f 'node dist/index.js'", { encoding: "utf-8" }).trim();
    const pids = result.split("\n").filter(Boolean).map(Number).filter(n => !isNaN(n));
    return pids.length > 0 ? pids[0] : null;
  } catch {
    return null;
  }
}

function killOrphanChrome(): void {
  // Kill any SingletonLock that blocks puppeteer
  const lockPath = resolve(BOT_DIR, ".wwebjs_auth", "session", "SingletonLock");
  try {
    if (existsSync(lockPath)) {
      const { unlinkSync } = require("fs");
      unlinkSync(lockPath);
      appendFileSync(LOG_PATH, `[${new Date().toISOString()}] [INFO] [system] Removed stale SingletonLock\n`);
    }
  } catch {}

  // Also kill any orphan chromium processes from old bot sessions
  try {
    execSync("pkill -f 'chromium.*wwebjs' 2>/dev/null || true", { encoding: "utf-8", timeout: 5000 });
  } catch {}
}

function waitForBot(maxWaitMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (findBotPid() !== null) {
        resolve(true);
        return;
      }
      if (Date.now() - start > maxWaitMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 500);
    };
    setTimeout(check, 1000);
  });
}

export async function GET() {
  const pid = findBotPid();
  return NextResponse.json({
    running: pid !== null,
    pid,
  });
}

export async function POST(request: NextRequest) {
  const { action } = await request.json();

  if (action === "start") {
    const existingPid = findBotPid();
    if (existingPid) {
      return NextResponse.json({ success: true, pid: existingPid, message: "Already running" });
    }

    try {
      // Clean up stale browser locks
      killOrphanChrome();

      // Build
      execSync("npm run build", { cwd: BOT_DIR, encoding: "utf-8", timeout: 60000 });

      // Start bot with output going to log file
      const child = spawn("node", ["dist/index.js"], {
        cwd: BOT_DIR,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Pipe stdout/stderr to log file for visibility
      if (child.stdout) {
        child.stdout.on("data", (data: Buffer) => {
          try { appendFileSync(LOG_PATH, data.toString()); } catch {}
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (data: Buffer) => {
          try { appendFileSync(LOG_PATH, data.toString()); } catch {}
        });
      }

      child.unref();

      // Wait up to 5 seconds to confirm it's running
      const started = await waitForBot(5000);

      return NextResponse.json({ success: started, pid: child.pid, message: started ? "Limor started" : "Started but may have crashed — check logs" });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message?.substring(0, 300) });
    }
  }

  if (action === "stop") {
    const pid = findBotPid();
    if (!pid) {
      return NextResponse.json({ success: false, error: "Limor is not running" });
    }
    try {
      process.kill(pid, "SIGTERM");
      // Wait for it to die
      await new Promise((r) => setTimeout(r, 2000));
      const stillRunning = findBotPid() !== null;
      if (stillRunning) {
        // Force kill
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message });
    }
  }

  if (action === "restart") {
    // Stop
    const pid = findBotPid();
    if (pid) {
      try { process.kill(pid, "SIGTERM"); } catch {}
      await new Promise((r) => setTimeout(r, 3000));
      if (findBotPid() !== null) {
        try { process.kill(pid, "SIGKILL"); } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    killOrphanChrome();

    try {
      execSync("npm run build", { cwd: BOT_DIR, encoding: "utf-8", timeout: 60000 });
      const child = spawn("node", ["dist/index.js"], {
        cwd: BOT_DIR,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (child.stdout) {
        child.stdout.on("data", (data: Buffer) => {
          try { appendFileSync(LOG_PATH, data.toString()); } catch {}
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (data: Buffer) => {
          try { appendFileSync(LOG_PATH, data.toString()); } catch {}
        });
      }

      child.unref();
      const started = await waitForBot(5000);

      return NextResponse.json({ success: started, pid: child.pid });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message?.substring(0, 300) });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
