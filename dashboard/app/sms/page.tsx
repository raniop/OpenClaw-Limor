export const dynamic = "force-dynamic";

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { MarkReceivedButton } from "./mark-received";

const DB_PATH = resolve(process.env.HOME || "~", "Library/Messages/chat.db");
const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const DELIVERIES_PATH = resolve(STATE_DIR, "deliveries.json");

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

interface SmsMsg {
  id: number;
  text: string;
  sender: string;
  isFromMe: boolean;
  timestamp: string;
  service: string;
  isDelivery: boolean;
}

interface DeliveryEntry {
  id: string;
  carrier: string;
  trackingNumber?: string;
  summary: string;
  smsText: string;
  sender: string;
  smsTimestamp: string;
  status: "pending" | "received";
  receivedAt?: string;
}

function getMessages(): SmsMsg[] {
  if (!existsSync(DB_PATH)) return [];
  const script = `
import sqlite3, re, json, time
DB = "${DB_PATH}"
def extract_text(row_text, row_blob):
    if row_text: return row_text
    if not row_blob: return ""
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
    except: return ""
conn = sqlite3.connect(DB)
since_nano = int((time.time() - 978307200 - 168 * 3600) * 1e9)
rows = conn.execute("""SELECT m.rowid, m.text, h.id, m.is_from_me, datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime'), m.service, m.attributedBody FROM message m LEFT JOIN handle h ON m.handle_id = h.rowid WHERE m.date > ? ORDER BY m.date DESC LIMIT 100""", (since_nano,)).fetchall()
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
    return JSON.parse(raw || "[]").map((m: any) => ({
      ...m,
      isDelivery: isDelivery(m.text, m.sender),
    }));
  } catch {
    return [];
  }
}

function getDeliveryStore(): DeliveryEntry[] {
  if (!existsSync(DELIVERIES_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DELIVERIES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export default function SmsPage() {
  const messages = getMessages();
  const deliveryStore = getDeliveryStore();
  const pendingDeliveries = deliveryStore.filter((d) => d.status === "pending");
  const receivedDeliveries = deliveryStore.filter((d) => d.status === "received");
  const smsDeliveries = messages.filter((m) => m.isDelivery);
  const others = messages.filter((m) => !m.isDelivery && !m.isFromMe);

  return (
    <div>
      <h1>SMS & Deliveries</h1>
      <h2>Last 7 days — {messages.length} messages</h2>

      {/* Tracked deliveries from store */}
      {pendingDeliveries.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>📦 Pending Deliveries ({pendingDeliveries.length})</h3>
          {pendingDeliveries.map((d) => (
            <div key={d.id} className="card" style={{ borderLeft: "3px solid var(--warning)" }}>
              <div className="card-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{d.carrier}</strong>
                  {d.trackingNumber && <span style={{ marginLeft: "0.5rem", opacity: 0.7 }}>#{d.trackingNumber}</span>}
                  <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)", borderColor: "rgba(245,158,11,0.3)", marginLeft: "0.5rem" }}>Pending</span>
                </div>
                <MarkReceivedButton id={d.id} />
              </div>
              <div className="card-meta">{d.smsTimestamp} · {d.sender}</div>
              <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                {d.smsText.substring(0, 300)}
              </p>
            </div>
          ))}
        </>
      )}

      {/* SMS-detected deliveries (not yet in store) */}
      {smsDeliveries.length > 0 && pendingDeliveries.length === 0 && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>📦 Delivery Messages ({smsDeliveries.length})</h3>
          {smsDeliveries.map((m) => (
            <div key={m.id} className="card" style={{ borderLeft: "3px solid var(--success)" }}>
              <div className="card-row">
                <strong>{m.sender}</strong>
                <span className="badge badge-approved">Delivery</span>
              </div>
              <div className="card-meta">{m.timestamp} · {m.service}</div>
              <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                {m.text.substring(0, 300)}
              </p>
            </div>
          ))}
        </>
      )}

      {smsDeliveries.length === 0 && pendingDeliveries.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p>No pending deliveries</p>
        </div>
      )}

      {/* Recently received */}
      {receivedDeliveries.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.5rem" }}>✅ Recently Received ({receivedDeliveries.length})</h3>
          {receivedDeliveries.slice(0, 10).map((d) => (
            <div key={d.id} className="card" style={{ borderLeft: "3px solid var(--success)", opacity: 0.7 }}>
              <div className="card-row">
                <strong>{d.carrier}</strong>
                {d.trackingNumber && <span style={{ marginLeft: "0.5rem", opacity: 0.7 }}>#{d.trackingNumber}</span>}
                <span className="badge badge-approved">Received</span>
              </div>
              <div className="card-meta">Received: {d.receivedAt ? new Date(d.receivedAt).toLocaleString("he-IL") : "—"}</div>
            </div>
          ))}
        </>
      )}

      <h3 style={{ marginTop: "1.5rem" }}>📱 Other SMS ({others.length})</h3>
      {others.slice(0, 20).map((m) => (
        <div key={m.id} className="card">
          <div className="card-row">
            <strong>{m.sender}</strong>
          </div>
          <div className="card-meta">{m.timestamp} · {m.service}</div>
          <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
            {m.text.substring(0, 200)}
          </p>
        </div>
      ))}
    </div>
  );
}
