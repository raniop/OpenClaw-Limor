import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const DELIVERIES_PATH = resolve(STATE_DIR, "deliveries.json");

interface DeliveryEntry {
  id: string;
  smsId: number;
  carrier: string;
  trackingNumber?: string;
  summary: string;
  smsText: string;
  sender: string;
  smsTimestamp: string;
  status: "pending" | "received";
  createdAt: string;
  receivedAt?: string;
}

function readStore(): DeliveryEntry[] {
  if (!existsSync(DELIVERIES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DELIVERIES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: DeliveryEntry[]): void {
  writeFileSync(DELIVERIES_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readStore());
}

export async function POST(req: Request) {
  const { id, action } = await req.json();
  if (action === "mark_received" && id) {
    const entries = readStore();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
    entry.status = "received";
    entry.receivedAt = new Date().toISOString();
    writeStore(entries);
    return NextResponse.json(entry);
  }
  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
