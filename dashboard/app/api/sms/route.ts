import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const DB_PATH = resolve(process.env.HOME || "~", "Library/Messages/chat.db");

const DELIVERY_PATTERNS = [
  /חבילה|package|parcel/i,
  /משלוח|delivery|shipment|shipping/i,
  /מעקב|tracking/i,
  /הגיעה?.*אל|arrived|delivered/i,
  /בדרך אליך|on its way|out for delivery/i,
  /נקודת איסוף|pickup|locker|לוקר/i,
  /הזמנה מספר|order #/i,
  /שליח|courier/i,
  /DHL|FedEx|FDX|UPS|Amazon|AliExpress|Shein|Temu|iHerb|Wolt|Boxit|בוקסיט|GetPack|דואר ישראל|Israel.Post/i,
];

function isDelivery(text: string, sender: string): boolean {
  return DELIVERY_PATTERNS.some((p) => p.test(text + " " + sender));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const hours = parseInt(searchParams.get("hours") || "72");
  const deliveriesOnly = searchParams.get("deliveries") === "true";

  if (!existsSync(DB_PATH)) {
    return NextResponse.json({ error: "Messages DB not found" }, { status: 404 });
  }

  const script = `
import sqlite3, re, json, time

DB = "${DB_PATH}"

def extract_text(row_text, row_blob):
    if row_text:
        return row_text
    if not row_blob:
        return ""
    try:
        blob = bytes(row_blob)
        text = blob.decode("utf-8", errors="replace")
        segments = re.split(r'[\\x00-\\x08\\x0e-\\x1f\\ufffd]{3,}', text)
        best = ""
        for seg in segments:
            clean = seg.strip()
            if len(clean) > len(best) and (re.search(r'[\\u0590-\\u05ff]', clean) or re.search(r'[a-zA-Z]{3,}', clean)):
                best = clean
        best = re.sub(r'^[^\\u0590-\\u05ffa-zA-Z0-9]*', '', best)
        return best.strip()
    except:
        return ""

conn = sqlite3.connect(DB)
epoch2001 = 978307200
since_nano = int((time.time() - epoch2001 - ${hours} * 3600) * 1e9)
rows = conn.execute("""
    SELECT m.rowid, m.text, h.id, m.is_from_me,
           datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime'),
           m.service, m.attributedBody
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.rowid
    WHERE m.date > ?
    ORDER BY m.date DESC
    LIMIT 100
""", (since_nano,)).fetchall()
result = []
for r in rows:
    text = extract_text(r[1], r[6])
    if text and len(text) > 5:
        result.append({"id": r[0], "text": text[:500], "sender": r[2] or "", "isFromMe": bool(r[3]), "timestamp": r[4] or "", "service": r[5] or ""})
print(json.dumps(result, ensure_ascii=False))
conn.close()
`;

  try {
    const raw = execSync("python3", { input: script, encoding: "utf-8", timeout: 10000 }).trim();
    const messages = JSON.parse(raw || "[]").map((m: any) => ({
      ...m,
      isDelivery: isDelivery(m.text, m.sender),
    }));

    if (deliveriesOnly) {
      return NextResponse.json(messages.filter((m: any) => m.isDelivery));
    }
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json([]);
  }
}
