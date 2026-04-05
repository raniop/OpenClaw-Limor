import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const BILLS_PATH = resolve(STATE_DIR, "bills.json");

function readStore(): any[] {
  if (!existsSync(BILLS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(BILLS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: any[]): void {
  writeFileSync(BILLS_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readStore());
}

export async function POST(req: Request) {
  const { id, action } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const entries = readStore();
  const entry = entries.find((e: any) => e.id === id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "mark_paid") {
    entry.status = "paid";
    entry.paidAt = new Date().toISOString();
    writeStore(entries);
    return NextResponse.json(entry);
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
