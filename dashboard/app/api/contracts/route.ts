import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const CONTRACTS_PATH = resolve(STATE_DIR, "contracts.json");

function readStore(): any[] {
  if (!existsSync(CONTRACTS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(CONTRACTS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(entries: any[]): void {
  writeFileSync(CONTRACTS_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readStore());
}

export async function POST(req: Request) {
  const { id, action, updates } = await req.json();

  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const entries = readStore();
  const entry = entries.find((e: any) => e.id === id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "cancel") {
    entry.status = "cancelled";
    entry.updatedAt = new Date().toISOString();
    writeStore(entries);
    return NextResponse.json(entry);
  }

  if (action === "update" && updates) {
    Object.assign(entry, updates);
    entry.updatedAt = new Date().toISOString();
    writeStore(entries);
    return NextResponse.json(entry);
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
