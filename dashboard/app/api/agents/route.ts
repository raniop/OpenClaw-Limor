import { NextResponse } from "next/server";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const soulsDir = join(process.cwd(), "..", "souls");
  const files = readdirSync(soulsDir).filter((f) => f.endsWith(".json"));

  const agents = files.map((file) => {
    const raw = JSON.parse(readFileSync(join(soulsDir, file), "utf-8"));
    const id = file.replace(".json", "");

    // Two soul formats: limor/alma have identity.role, others have top-level role
    const name = raw.name || id;
    const nameEn = raw.nameEn || id.charAt(0).toUpperCase() + id.slice(1);
    const emoji = raw.emoji || (id === "limor" ? "🐾" : "");
    const role = raw.identity?.role || raw.role || "";

    return { id, name, nameEn, emoji, role };
  });

  return NextResponse.json(agents);
}
