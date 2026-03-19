import { NextRequest, NextResponse } from "next/server";
import { execSync, spawn } from "child_process";
import { resolve } from "path";
import { isLimorRunning } from "@/lib/data";

const BOT_DIR = resolve(process.cwd(), "..");

function findBotPid(): number | null {
  try {
    const result = execSync("pgrep -f 'node dist/index.js'", { encoding: "utf-8" }).trim();
    const pids = result.split("\n").filter(Boolean);
    return pids.length > 0 ? parseInt(pids[0]) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const pid = findBotPid();
  return NextResponse.json({
    running: pid !== null || isLimorRunning(),
    pid,
  });
}

export async function POST(request: NextRequest) {
  const { action } = await request.json();

  if (action === "start") {
    const existingPid = findBotPid();
    if (existingPid) {
      return NextResponse.json({ success: false, error: "Limor is already running", pid: existingPid });
    }

    try {
      // Build first, then start
      execSync("npm run build", { cwd: BOT_DIR, encoding: "utf-8", timeout: 30000 });

      // Start bot detached
      const child = spawn("node", ["dist/index.js"], {
        cwd: BOT_DIR,
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      return NextResponse.json({ success: true, pid: child.pid });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message?.substring(0, 200) });
    }
  }

  if (action === "stop") {
    const pid = findBotPid();
    if (!pid) {
      return NextResponse.json({ success: false, error: "Limor is not running" });
    }
    try {
      process.kill(pid, "SIGTERM");
      return NextResponse.json({ success: true });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message });
    }
  }

  if (action === "restart") {
    const pid = findBotPid();
    if (pid) {
      try { process.kill(pid, "SIGTERM"); } catch {}
      // Wait a moment for cleanup
      await new Promise((r) => setTimeout(r, 2000));
    }

    try {
      execSync("npm run build", { cwd: BOT_DIR, encoding: "utf-8", timeout: 30000 });
      const child = spawn("node", ["dist/index.js"], {
        cwd: BOT_DIR,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return NextResponse.json({ success: true, pid: child.pid });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message?.substring(0, 200) });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
