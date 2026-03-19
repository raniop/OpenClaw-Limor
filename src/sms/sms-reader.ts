/**
 * SMS Reader — reads iMessage/SMS from macOS Messages database.
 * Uses a Python script to handle attributedBody blob extraction.
 * Requires Full Disk Access for the running process.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const DB_PATH = resolve(process.env.HOME || "~", "Library/Messages/chat.db");
const PY_SCRIPT = resolve(__dirname, "..", "..", "src", "sms", "extract_sms.py");
// Fallback for compiled dist/
const PY_SCRIPT_DIST = resolve(__dirname, "..", "sms", "extract_sms.py");

export interface SmsMessage {
  id: number;
  text: string;
  sender: string;
  isFromMe: boolean;
  timestamp: string;
  service: string;
}

function getScriptPath(): string {
  if (existsSync(PY_SCRIPT)) return PY_SCRIPT;
  if (existsSync(PY_SCRIPT_DIST)) return PY_SCRIPT_DIST;
  // Fallback: look relative to cwd
  const cwdPath = resolve(process.cwd(), "src", "sms", "extract_sms.py");
  if (existsSync(cwdPath)) return cwdPath;
  return PY_SCRIPT;
}

function pyCall(params: Record<string, any>): string {
  try {
    const input = JSON.stringify({ db: DB_PATH, ...params });
    return execSync(`python3 "${getScriptPath()}"`, {
      input,
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
  } catch (err) {
    console.error("[sms] Python call failed:", (err as any).message?.substring(0, 200));
    return "";
  }
}

export function isAvailable(): boolean {
  if (!existsSync(DB_PATH)) return false;
  try {
    const raw = pyCall({ action: "available" });
    if (!raw) return false;
    const result = JSON.parse(raw);
    return result.count > 0;
  } catch {
    return false;
  }
}

export function getRecentMessages(
  limit: number = 20,
  sinceHours: number = 24,
  smsOnly: boolean = false
): SmsMessage[] {
  return parseJsonResult(pyCall({
    action: "recent",
    hours: sinceHours,
    limit,
    sms_only: smsOnly,
  }));
}

export function searchMessages(keyword: string, limit: number = 10): SmsMessage[] {
  return parseJsonResult(pyCall({
    action: "search",
    keyword,
    limit,
  }));
}

export function getLatestMessageId(): number {
  try {
    const raw = pyCall({ action: "latest_id" });
    if (!raw) return 0;
    return JSON.parse(raw).id || 0;
  } catch {
    return 0;
  }
}

export function getMessagesSince(sinceId: number, limit: number = 50): SmsMessage[] {
  return parseJsonResult(pyCall({
    action: "since_id",
    since_id: sinceId,
    limit,
  }));
}

function parseJsonResult(raw: string): SmsMessage[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
