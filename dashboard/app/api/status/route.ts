import { NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const LOG_PATH = resolve(STATE_DIR, "limor.log");

interface FeedEntry {
  time: string;
  contact: string;
  action: string;
  outcome: string;
}

export async function GET() {
  // 1. Check if bot process is running
  let isOnline = false;
  try {
    const ps = execSync("pgrep -f 'node dist/index.js'", { encoding: "utf-8" }).trim();
    isOnline = ps.length > 0;
  } catch {
    // Also check log freshness as fallback
    if (existsSync(LOG_PATH)) {
      try {
        const stats = statSync(LOG_PATH);
        isOnline = Date.now() - stats.mtimeMs < 5 * 60 * 1000;
      } catch {}
    }
  }

  // 2. Parse log file for trace data
  let lastMessageAt = "";
  let messagesToday = 0;
  let groupsFiltered = 0;
  const recentFeed: FeedEntry[] = [];

  if (existsSync(LOG_PATH)) {
    try {
      const content = readFileSync(LOG_PATH, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);

      const today = new Date().toISOString().slice(0, 10);

      // Parse structured log lines
      const traceStartPattern = /^\[([^\]]+)\] \[INFO\] \[trace\] Message flow started \| traceId="[^"]*" chatId="[^"]*" contact="([^"]*)" isGroup=(true|false) isOwner=(true|false)$/;
      const traceCompletePattern = /^\[([^\]]+)\] \[INFO\] \[trace\] Message flow completed: (\S+) \| traceId="[^"]*" chatId="[^"]*"(?: durationMs=\d+)? outcome="([^"]*)"$/;

      // Collect completed traces for feed
      const completedTraces: Array<{ time: string; outcome: string }> = [];
      const startedTraces: Map<string, { time: string; contact: string; isGroup: boolean }> = new Map();

      for (const line of lines) {
        // Match flow started
        const startMatch = line.match(/^\[([^\]]+)\] \[INFO\] \[trace\] Message flow started \| traceId="([^"]*)" chatId="[^"]*" contact="([^"]*)" isGroup=(true|false)/);
        if (startMatch) {
          const [, timestamp, traceId, contact, isGroup] = startMatch;
          startedTraces.set(traceId, { time: timestamp, contact, isGroup: isGroup === "true" });

          // Count messages today
          if (timestamp.startsWith(today)) {
            messagesToday++;
          }

          lastMessageAt = timestamp;
        }

        // Match flow completed
        const completeMatch = line.match(/^\[([^\]]+)\] \[INFO\] \[trace\] Message flow completed: \S+ \| traceId="([^"]*)" chatId="[^"]*"(?: durationMs=\d+)? outcome="([^"]*)"/);
        if (completeMatch) {
          const [, timestamp, traceId, outcome] = completeMatch;

          // Count groups filtered today
          if (timestamp.startsWith(today) && (outcome === "muted_group" || outcome === "group_filtered")) {
            groupsFiltered++;
          }

          const startInfo = startedTraces.get(traceId);
          if (startInfo) {
            recentFeed.push({
              time: startInfo.time,
              contact: startInfo.contact,
              action: startInfo.isGroup ? "Group message" : "Direct message",
              outcome,
            });
          }
        }
      }
    } catch {}
  }

  // 3. Read followups count
  let activeFollowups = 0;
  const followupsPath = resolve(STATE_DIR, "followups.json");
  if (existsSync(followupsPath)) {
    try {
      const followups = JSON.parse(readFileSync(followupsPath, "utf-8"));
      activeFollowups = Array.isArray(followups)
        ? followups.filter((f: any) => f.status === "pending").length
        : 0;
    } catch {}
  }

  // Return last 25 feed entries, newest first
  const feed = recentFeed.slice(-25).reverse();

  return NextResponse.json({
    isOnline,
    lastMessageAt,
    messagesToday,
    groupsFiltered,
    activeFollowups,
    recentFeed: feed,
  });
}
