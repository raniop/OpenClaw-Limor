export const dynamic = "force-dynamic";

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const BILLS_PATH = resolve(STATE_DIR, "bills.json");

interface Bill {
  id: string;
  vendor: string;
  category: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  status: string;
  source?: string;
  summary: string;
  createdAt: string;
  paidAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  electricity: "חשמל", water: "מים", tax: "ארנונה", gas: "גז",
  phone: "טלפון", internet: "אינטרנט", insurance: "ביטוח", rent: "שכירות", other: "אחר",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  electricity: "⚡", water: "💧", tax: "🏛️", gas: "🔥",
  phone: "📱", internet: "🌐", insurance: "🛡️", rent: "🏠", other: "📄",
};

const STATUS_STYLES: Record<string, string> = {
  unpaid: "badge-warning", paid: "badge-success", overdue: "badge-danger",
};

const STATUS_LABELS: Record<string, string> = {
  unpaid: "לא שולם", paid: "שולם", overdue: "באיחור",
};

const SOURCE_LABELS: Record<string, string> = {
  email: "📧 מייל", whatsapp_document: "📱 וואטסאפ", manual: "✏️ ידני",
};

function readBills(): Bill[] {
  if (!existsSync(BILLS_PATH)) return [];
  try { return JSON.parse(readFileSync(BILLS_PATH, "utf-8")); } catch { return []; }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMonth(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatAmount(amount: number, currency: string): string {
  if (currency === "ILS") return `₪${amount.toLocaleString("he-IL")}`;
  if (currency === "USD") return `$${amount.toLocaleString("en-US")}`;
  return `${amount} ${currency}`;
}

export default function BillsPage() {
  const bills = readBills();
  const unpaid = bills.filter((b) => b.status !== "paid");
  const paid = bills.filter((b) => b.status === "paid");
  const overdue = bills.filter((b) => b.status === "overdue");
  const unpaidTotal = unpaid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);
  const paidTotal = paid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);

  // Group by vendor for spending breakdown
  const vendorTotals: Record<string, { total: number; count: number; category: string }> = {};
  for (const b of bills) {
    const key = b.vendor;
    if (!vendorTotals[key]) vendorTotals[key] = { total: 0, count: 0, category: b.category };
    vendorTotals[key].total += b.currency === "ILS" ? b.amount : 0;
    vendorTotals[key].count++;
  }

  // Average monthly from paid bills
  const monthSet = new Set(paid.map((b) => b.periodEnd?.substring(0, 7)).filter(Boolean));
  const avgMonthly = monthSet.size > 0 ? paidTotal / monthSet.size : 0;

  // Sort: overdue first, then unpaid, then newest paid
  const sorted = [...bills].sort((a, b) => {
    const statusOrder: Record<string, number> = { overdue: 0, unpaid: 1, paid: 2 };
    const sa = statusOrder[a.status] ?? 1;
    const sb = statusOrder[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    return new Date(b.periodEnd || b.createdAt).getTime() - new Date(a.periodEnd || a.createdAt).getTime();
  });

  return (
    <div>
      <h2>📄 חשבוניות ותשלומים</h2>

      {/* Summary Cards */}
      <div className="grid grid-4" style={{ marginBottom: "24px" }}>
        <div className="stat-card">
          <div className="stat-value">{bills.length}</div>
          <div className="stat-label">סה״כ חשבוניות</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: unpaid.length > 0 ? "var(--color-warning)" : "var(--color-success)" }}>
            {unpaid.length > 0 ? `${unpaid.length} לתשלום` : "הכל שולם ✅"}
          </div>
          <div className="stat-label">{overdue.length > 0 ? `${overdue.length} באיחור!` : "סטטוס"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: unpaidTotal > 0 ? "var(--color-warning)" : undefined }}>
            ₪{Math.round(unpaidTotal).toLocaleString("he-IL")}
          </div>
          <div className="stat-label">ממתין לתשלום</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₪{Math.round(avgMonthly).toLocaleString("he-IL")}</div>
          <div className="stat-label">ממוצע חודשי</div>
        </div>
      </div>

      {/* Spending Breakdown by Vendor */}
      {Object.keys(vendorTotals).length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "12px" }}>💰 פילוח הוצאות לפי ספק</h3>
          <div className="grid grid-3">
            {Object.entries(vendorTotals)
              .sort(([, a], [, b]) => b.total - a.total)
              .map(([vendor, data]) => (
                <div className="card" key={vendor} style={{ padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 600 }}>
                      {CATEGORY_EMOJIS[data.category] || "📄"} {vendor}
                    </span>
                    <span className="badge badge-muted">{data.count} חשבוניות</span>
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 700 }}>
                    ₪{Math.round(data.total).toLocaleString("he-IL")}
                  </div>
                  <div className="text-muted" style={{ fontSize: "13px" }}>
                    {CATEGORY_LABELS[data.category] || data.category} | ממוצע ₪{Math.round(data.total / data.count).toLocaleString("he-IL")} לחשבון
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {bills.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📄</p>
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>אין חשבוניות רשומות עדיין</p>
          <p className="text-muted">שלח PDF של חשבון ללימור בוואטסאפ, או הוסף ידנית דרך השיחה</p>
        </div>
      ) : (
        <div>
          <h3 style={{ marginBottom: "12px" }}>📋 כל החשבוניות</h3>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="glass-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>ספק</th>
                  <th>תקופה</th>
                  <th>סכום</th>
                  <th>מס׳ חשבונית</th>
                  <th>לתשלום עד</th>
                  <th>מקור</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const days = daysUntil(b.dueDate);
                  const period = formatMonth(b.periodEnd) || formatMonth(b.periodStart);
                  return (
                    <tr key={b.id} style={{ opacity: b.status === "paid" ? 0.7 : 1 }}>
                      <td style={{ fontWeight: 600 }}>
                        {CATEGORY_EMOJIS[b.category] || "📄"} {b.vendor}
                        <span className="text-muted" style={{ fontSize: "12px", display: "block" }}>
                          {CATEGORY_LABELS[b.category] || b.category}
                        </span>
                      </td>
                      <td>{period || "—"}</td>
                      <td style={{ fontWeight: 700, fontSize: "15px" }}>{formatAmount(b.amount, b.currency)}</td>
                      <td style={{ fontSize: "13px" }}>{b.invoiceNumber || "—"}</td>
                      <td>
                        {formatDate(b.dueDate)}
                        {days !== null && b.status !== "paid" && (
                          <span style={{
                            fontSize: "12px", display: "block",
                            color: days < 0 ? "var(--color-danger)" : days <= 3 ? "var(--color-warning)" : undefined,
                          }}>
                            {days < 0 ? `${Math.abs(days)} ימים באיחור` : days === 0 ? "היום!" : `עוד ${days} ימים`}
                          </span>
                        )}
                        {b.paidAt && b.status === "paid" && (
                          <span className="text-muted" style={{ fontSize: "12px", display: "block" }}>
                            שולם {formatDate(b.paidAt)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: "12px" }}>{SOURCE_LABELS[b.source || ""] || b.source || "—"}</td>
                      <td>
                        <span className={`badge ${STATUS_STYLES[b.status] || ""}`}>
                          {STATUS_LABELS[b.status] || b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
