export const dynamic = "force-dynamic";

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const STATE_DIR = resolve(process.cwd(), "..", "workspace", "state");
const CONTRACTS_PATH = resolve(STATE_DIR, "contracts.json");

interface Contract {
  id: string;
  vendor: string;
  category: string;
  amount?: number;
  currency: string;
  billingCycle: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  autoRenew: boolean;
  status: string;
  source?: string;
  summary: string;
  terms?: string;
  lastEmailDate?: string;
  createdAt: string;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  internet: "אינטרנט", electricity: "חשמל", rent: "שכירות", insurance: "ביטוח",
  water: "מים", tax: "ארנונה", tv: "טלוויזיה", gas: "גז",
  streaming: "סטרימינג", phone: "טלפון", pension: "פנסיה/גמל", vehicle: "רכב", other: "אחר",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  internet: "🌐", electricity: "⚡", rent: "🏠", insurance: "🛡️",
  water: "💧", tax: "🏛️", tv: "📺", gas: "🔥",
  streaming: "🎬", phone: "📱", pension: "🏦", vehicle: "🚗", other: "📋",
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "חודשי", bimonthly: "דו-חודשי", quarterly: "רבעוני", yearly: "שנתי",
};

const STATUS_STYLES: Record<string, string> = {
  active: "badge-success", expiring_soon: "badge-warning", expired: "badge-danger", cancelled: "badge-muted",
};

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל", expiring_soon: "מתחדש בקרוב", expired: "פג תוקף", cancelled: "בוטל",
};

const SOURCE_LABELS: Record<string, string> = {
  email: "📧 מייל", whatsapp_document: "📱 וואטסאפ", manual: "✏️ ידני",
};

function readContracts(): Contract[] {
  if (!existsSync(CONTRACTS_PATH)) return [];
  try { return JSON.parse(readFileSync(CONTRACTS_PATH, "utf-8")); } catch { return []; }
}

function toMonthly(amount: number, cycle: string): number {
  switch (cycle) {
    case "bimonthly": return amount / 2;
    case "quarterly": return amount / 3;
    case "yearly": return amount / 12;
    default: return amount;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export default function ContractsPage() {
  const contracts = readContracts();
  const active = contracts.filter((c) => c.status !== "cancelled");
  const expiring = contracts.filter((c) => c.status === "expiring_soon");
  const cancelled = contracts.filter((c) => c.status === "cancelled");

  // Monthly total
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  for (const c of active) {
    if (c.amount && c.currency === "ILS") {
      const monthly = toMonthly(c.amount, c.billingCycle);
      monthlyTotal += monthly;
      yearlyTotal += monthly * 12;
    }
  }

  // Next renewal
  const nextRenewal = active
    .filter((c) => c.renewalDate || c.endDate)
    .sort((a, b) => {
      const da = new Date(a.renewalDate || a.endDate || "").getTime();
      const db = new Date(b.renewalDate || b.endDate || "").getTime();
      return da - db;
    })[0];

  // Group by category
  const grouped: Record<string, Contract[]> = {};
  for (const c of contracts.filter((c) => c.status !== "cancelled")) {
    const cat = c.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  // Category spending breakdown
  const categoryTotals: Record<string, number> = {};
  for (const c of active) {
    if (c.amount && c.currency === "ILS") {
      const cat = c.category || "other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + toMonthly(c.amount, c.billingCycle);
    }
  }

  return (
    <div>
      <h2>📋 חוזים ומנויים</h2>

      {/* Summary Cards */}
      <div className="grid grid-4" style={{ marginBottom: "24px" }}>
        <div className="stat-card">
          <div className="stat-value">{active.length}</div>
          <div className="stat-label">מנויים פעילים</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₪{Math.round(monthlyTotal).toLocaleString("he-IL")}</div>
          <div className="stat-label">עלות חודשית</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₪{Math.round(yearlyTotal).toLocaleString("he-IL")}</div>
          <div className="stat-label">עלות שנתית</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: expiring.length > 0 ? "var(--color-warning)" : undefined, fontSize: expiring.length > 0 ? "28px" : "18px" }}>
            {expiring.length > 0
              ? `${expiring.length} מתחדשים`
              : nextRenewal
              ? formatDate(nextRenewal.renewalDate || nextRenewal.endDate)
              : "—"
            }
          </div>
          <div className="stat-label">{expiring.length > 0 ? "דורשים תשומת לב" : "חידוש הבא"}</div>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(categoryTotals).length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "12px" }}>💰 עלות חודשית לפי קטגוריה</h3>
          <div className="grid grid-3">
            {Object.entries(categoryTotals)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, total]) => (
                <div className="card" key={cat} style={{ padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 600 }}>
                      {CATEGORY_EMOJIS[cat] || "📋"} {CATEGORY_LABELS[cat] || cat}
                    </span>
                    <span className="badge badge-muted">
                      {(grouped[cat] || []).length} מנויים
                    </span>
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 700 }}>
                    ₪{Math.round(total).toLocaleString("he-IL")}
                    <span className="text-muted" style={{ fontSize: "14px", fontWeight: 400 }}> /חודש</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📋</p>
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>אין חוזים רשומים עדיין</p>
          <p className="text-muted">חוזים יזוהו אוטומטית ממיילים או מ-PDF, או שאפשר להוסיף ידנית דרך וואטסאפ</p>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([, a], [, b]) => {
            const totalA = a.reduce((s, c) => s + toMonthly(c.amount || 0, c.billingCycle), 0);
            const totalB = b.reduce((s, c) => s + toMonthly(c.amount || 0, c.billingCycle), 0);
            return totalB - totalA;
          })
          .map(([category, items]) => (
            <div key={category} style={{ marginBottom: "24px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {CATEGORY_EMOJIS[category] || "📋"} {CATEGORY_LABELS[category] || category}
                <span className="text-muted" style={{ fontSize: "14px", marginRight: "8px" }}>
                  ({items.length} {items.length === 1 ? "מנוי" : "מנויים"})
                </span>
              </h3>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="glass-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th>ספק</th>
                      <th>סכום</th>
                      <th>מחזור</th>
                      <th>חידוש/סיום</th>
                      <th>תנאים</th>
                      <th>מקור</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => {
                      const days = daysUntil(c.renewalDate || c.endDate);
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>
                            {c.vendor}
                            {c.autoRenew && (
                              <span className="text-muted" style={{ fontSize: "11px", display: "block" }}>🔄 חידוש אוטומטי</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: "15px" }}>
                            {c.amount ? formatAmount(c.amount, c.currency) : "—"}
                          </td>
                          <td>{CYCLE_LABELS[c.billingCycle] || c.billingCycle}</td>
                          <td>
                            {formatDate(c.renewalDate || c.endDate)}
                            {days !== null && (
                              <span style={{
                                fontSize: "12px", display: "block",
                                color: days <= 30 && days >= 0 ? "var(--color-warning)" : days < 0 ? "var(--color-danger)" : undefined,
                              }}>
                                {days < 0 ? `פג לפני ${Math.abs(days)} ימים` : days === 0 ? "היום!" : `עוד ${days} ימים`}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "13px", maxWidth: "250px" }}>
                            {c.terms || <span className="text-muted">—</span>}
                          </td>
                          <td style={{ fontSize: "12px" }}>{SOURCE_LABELS[c.source || ""] || c.source || "—"}</td>
                          <td>
                            <span className={`badge ${STATUS_STYLES[c.status] || ""}`}>
                              {STATUS_LABELS[c.status] || c.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
      )}

      {/* Cancelled contracts section */}
      {cancelled.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <h3 className="text-muted" style={{ marginBottom: "12px" }}>🚫 חוזים שבוטלו ({cancelled.length})</h3>
          <div className="card" style={{ padding: "16px", opacity: 0.6 }}>
            {cancelled.map((c) => (
              <div key={c.id} style={{ marginBottom: "8px" }}>
                <span>{CATEGORY_EMOJIS[c.category] || "📋"} {c.vendor}</span>
                <span className="text-muted" style={{ marginRight: "8px" }}>
                  — {c.amount ? formatAmount(c.amount, c.currency) : ""} {CYCLE_LABELS[c.billingCycle] || ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
