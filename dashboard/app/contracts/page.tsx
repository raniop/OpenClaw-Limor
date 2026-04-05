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
  summary: string;
  terms?: string;
  lastEmailDate?: string;
  createdAt: string;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  internet: "אינטרנט",
  electricity: "חשמל",
  rent: "שכירות",
  insurance: "ביטוח",
  water: "מים",
  tax: "ארנונה",
  tv: "טלוויזיה",
  gas: "גז",
  streaming: "סטרימינג",
  phone: "טלפון",
  other: "אחר",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  internet: "🌐",
  electricity: "⚡",
  rent: "🏠",
  insurance: "🛡️",
  water: "💧",
  tax: "🏛️",
  tv: "📺",
  gas: "🔥",
  streaming: "🎬",
  phone: "📱",
  other: "📋",
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "חודשי",
  bimonthly: "דו-חודשי",
  quarterly: "רבעוני",
  yearly: "שנתי",
};

const STATUS_STYLES: Record<string, string> = {
  active: "badge-success",
  expiring_soon: "badge-warning",
  expired: "badge-danger",
  cancelled: "badge-muted",
};

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  expiring_soon: "מתחדש בקרוב",
  expired: "פג תוקף",
  cancelled: "בוטל",
};

function readContracts(): Contract[] {
  if (!existsSync(CONTRACTS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(CONTRACTS_PATH, "utf-8"));
  } catch {
    return [];
  }
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
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function ContractsPage() {
  const contracts = readContracts();
  const active = contracts.filter((c) => c.status !== "cancelled");
  const expiring = contracts.filter((c) => c.status === "expiring_soon");

  // Monthly total (ILS only for simplicity)
  let monthlyTotal = 0;
  for (const c of active) {
    if (c.amount && c.currency === "ILS") {
      monthlyTotal += toMonthly(c.amount, c.billingCycle);
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
  for (const c of contracts) {
    const cat = c.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  return (
    <div>
      <h2>📋 חוזים ומנויים</h2>

      {/* Summary Cards */}
      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <div className="stat-card">
          <div className="stat-value">{active.length}</div>
          <div className="stat-label">מנויים פעילים</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">~{Math.round(monthlyTotal)} ₪</div>
          <div className="stat-label">עלות חודשית</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: expiring.length > 0 ? "var(--color-warning)" : undefined }}>
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

      {contracts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📋</p>
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
            אין חוזים רשומים עדיין
          </p>
          <p className="text-muted">
            חוזים יזוהו אוטומטית ממיילים, או שאפשר להוסיף ידנית דרך וואטסאפ
          </p>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, items]) => (
            <div key={category} style={{ marginBottom: "24px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {CATEGORY_EMOJIS[category] || "📋"} {CATEGORY_LABELS[category] || category}
                <span className="text-muted" style={{ fontSize: "14px", marginRight: "8px" }}>
                  ({items.length})
                </span>
              </h3>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="glass-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th>ספק</th>
                      <th>סכום</th>
                      <th>מחזור</th>
                      <th>חידוש</th>
                      <th>תנאים</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => {
                      const days = daysUntil(c.renewalDate || c.endDate);
                      const daysText = days !== null ? `(${days} ימים)` : "";
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.vendor}</td>
                          <td>
                            {c.amount ? `${c.amount} ${c.currency}` : "—"}
                          </td>
                          <td>{CYCLE_LABELS[c.billingCycle] || c.billingCycle}</td>
                          <td>
                            {formatDate(c.renewalDate || c.endDate)}{" "}
                            {daysText && (
                              <span
                                className="text-muted"
                                style={{
                                  fontSize: "12px",
                                  color: days !== null && days <= 30 ? "var(--color-warning)" : undefined,
                                }}
                              >
                                {daysText}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "13px", maxWidth: "250px" }}>
                            {c.terms || <span className="text-muted">—</span>}
                          </td>
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
    </div>
  );
}
