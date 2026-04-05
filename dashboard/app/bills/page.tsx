export const dynamic = "force-dynamic";

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { VendorTrendChart, SpendingOverviewChart } from "./bill-chart";
import { MarkPaidButton } from "./mark-paid-button";

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
  phone: "טלפון", internet: "אינטרנט", tv: "טלוויזיה", streaming: "סטרימינג",
  insurance: "ביטוח", rent: "שכירות", other: "אחר",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  electricity: "⚡", water: "💧", tax: "🏛️", gas: "🔥",
  phone: "📱", internet: "🌐", tv: "📺", streaming: "🎬",
  insurance: "🛡️", rent: "🏠", other: "📄",
};

const VENDOR_COLORS: Record<string, string> = {
  "בזק-ג'ן": "#f59e0b",
  "HOT": "#ef4444",
  "Partner": "#8b5cf6",
  "Cellcom": "#10b981",
  "בזק": "#3b82f6",
  "Netflix": "#e50914",
  "Spotify": "#1db954",
};

function getVendorColor(vendor: string): string {
  return VENDOR_COLORS[vendor] || "#6366f1";
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  unpaid: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.3)" },
  paid: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", border: "rgba(16, 185, 129, 0.3)" },
  overdue: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.3)" },
};

const STATUS_LABELS: Record<string, string> = {
  unpaid: "לא שולם", paid: "שולם ✅", overdue: "באיחור! ⚠️",
};

const SOURCE_LABELS: Record<string, string> = {
  email: "📧", whatsapp_document: "📱", manual: "✏️",
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

export default function BillsPage() {
  const bills = readBills();
  const unpaid = bills.filter((b) => b.status !== "paid");
  const paid = bills.filter((b) => b.status === "paid");
  const overdue = bills.filter((b) => b.status === "overdue");
  const unpaidTotal = unpaid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);
  const paidTotal = paid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);
  const totalAll = bills.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);

  // Average monthly
  const monthSet = new Set(bills.map((b) => b.periodEnd?.substring(0, 7)).filter(Boolean));
  const avgMonthly = monthSet.size > 0 ? totalAll / monthSet.size : 0;

  // Group by vendor
  const vendorGroups: Record<string, Bill[]> = {};
  for (const b of bills) {
    if (!vendorGroups[b.vendor]) vendorGroups[b.vendor] = [];
    vendorGroups[b.vendor].push(b);
  }

  // Vendor data for overview chart
  const vendorData = Object.entries(vendorGroups).map(([vendor, vBills]) => ({
    vendor,
    total: vBills.reduce((s, b) => s + (b.currency === "ILS" ? b.amount : 0), 0),
    count: vBills.length,
    emoji: CATEGORY_EMOJIS[vBills[0].category] || "📄",
    color: getVendorColor(vendor),
  }));

  // Sort table: overdue → unpaid → newest paid
  const sorted = [...bills].sort((a, b) => {
    const order: Record<string, number> = { overdue: 0, unpaid: 1, paid: 2 };
    const sa = order[a.status] ?? 1;
    const sb = order[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    return new Date(b.periodEnd || b.createdAt).getTime() - new Date(a.periodEnd || a.createdAt).getTime();
  });

  return (
    <div>
      <h2 style={{ fontSize: "26px", marginBottom: "24px" }}>📄 חשבוניות ותשלומים</h2>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-4" style={{ marginBottom: "32px" }}>
        <div className="stat-card" style={{ borderBottom: `3px solid #6366f1` }}>
          <div className="stat-value" style={{ color: "#6366f1" }}>{bills.length}</div>
          <div className="stat-label">סה״כ חשבוניות</div>
        </div>
        <div className="stat-card" style={{ borderBottom: `3px solid ${unpaid.length > 0 ? "#f59e0b" : "#10b981"}` }}>
          <div className="stat-value" style={{ color: unpaid.length > 0 ? "#f59e0b" : "#10b981" }}>
            {unpaid.length > 0 ? `${unpaid.length} לתשלום` : "הכל שולם"}
          </div>
          <div className="stat-label">
            {overdue.length > 0 ? <span style={{ color: "#ef4444" }}>{overdue.length} באיחור!</span> : "סטטוס"}
          </div>
        </div>
        <div className="stat-card" style={{ borderBottom: `3px solid ${unpaidTotal > 0 ? "#f59e0b" : "#10b981"}` }}>
          <div className="stat-value">₪{Math.round(unpaidTotal).toLocaleString("he-IL")}</div>
          <div className="stat-label">ממתין לתשלום</div>
        </div>
        <div className="stat-card" style={{ borderBottom: "3px solid #8b5cf6" }}>
          <div className="stat-value">₪{Math.round(avgMonthly).toLocaleString("he-IL")}</div>
          <div className="stat-label">ממוצע חודשי</div>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📄</p>
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>אין חשבוניות רשומות עדיין</p>
          <p style={{ color: "#888" }}>שלח PDF של חשבון ללימור בוואטסאפ, או הוסף ידנית דרך השיחה</p>
        </div>
      ) : (
        <>
          {/* ─── Spending Overview Bar Chart ─── */}
          {vendorData.length > 1 && (
            <SpendingOverviewChart vendorData={vendorData} />
          )}

          {/* ─── Trend Charts per Vendor ─── */}
          {Object.entries(vendorGroups)
            .filter(([, vBills]) => vBills.filter((b) => b.periodEnd).length >= 2)
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([vendor, vBills]) => (
              <VendorTrendChart
                key={vendor}
                bills={vBills}
                vendor={vendor}
                color={getVendorColor(vendor)}
                emoji={CATEGORY_EMOJIS[vBills[0].category] || "📄"}
              />
            ))}

          {/* ─── Bills Table ─── */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.08)",
            overflow: "hidden",
            marginTop: "8px",
          }}>
            <h3 style={{ margin: 0, padding: "20px 24px 16px", fontSize: "18px" }}>📋 כל החשבוניות</h3>
            <table className="glass-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>ספק</th>
                  <th>תקופה</th>
                  <th>סכום</th>
                  <th>מס׳ חשבונית</th>
                  <th>לתשלום עד</th>
                  <th>סטטוס</th>
                  <th>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((b) => {
                  const days = daysUntil(b.dueDate);
                  const period = formatMonth(b.periodEnd) || formatMonth(b.periodStart);
                  const statusStyle = STATUS_COLORS[b.status] || STATUS_COLORS.unpaid;
                  const vendorColor = getVendorColor(b.vendor);

                  return (
                    <tr key={b.id} style={{ opacity: b.status === "paid" ? 0.65 : 1 }}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            width: "4px",
                            height: "32px",
                            borderRadius: "2px",
                            background: vendorColor,
                            flexShrink: 0,
                          }} />
                          <div>
                            <span style={{ fontWeight: 700 }}>
                              {CATEGORY_EMOJIS[b.category] || "📄"} {b.vendor}
                            </span>
                            <span style={{ fontSize: "12px", color: "#888", display: "block" }}>
                              {CATEGORY_LABELS[b.category] || b.category}
                              {b.source && ` • ${SOURCE_LABELS[b.source] || b.source}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{period || "—"}</td>
                      <td style={{ fontWeight: 700, fontSize: "15px" }}>
                        ₪{b.amount.toLocaleString("he-IL")}
                      </td>
                      <td style={{ fontSize: "13px", color: "#888" }}>{b.invoiceNumber || "—"}</td>
                      <td>
                        {formatDate(b.dueDate)}
                        {days !== null && b.status !== "paid" && (
                          <span style={{
                            fontSize: "12px", display: "block",
                            color: days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : "#888",
                            fontWeight: days <= 3 ? 600 : 400,
                          }}>
                            {days < 0 ? `${Math.abs(days)} ימים באיחור` : days === 0 ? "היום!" : `עוד ${days} ימים`}
                          </span>
                        )}
                        {b.paidAt && b.status === "paid" && (
                          <span style={{ fontSize: "12px", color: "#10b981", display: "block" }}>
                            שולם {formatDate(b.paidAt)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: statusStyle.bg,
                          color: statusStyle.text,
                          border: `1px solid ${statusStyle.border}`,
                        }}>
                          {STATUS_LABELS[b.status] || b.status}
                        </span>
                      </td>
                      <td>
                        {b.status !== "paid" && (
                          <MarkPaidButton
                            billId={b.id}
                            vendor={b.vendor}
                            amount={b.amount}
                            currency={b.currency}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
