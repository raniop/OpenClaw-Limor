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
  electricity: "חשמל",
  water: "מים",
  tax: "ארנונה",
  gas: "גז",
  phone: "טלפון",
  internet: "אינטרנט",
  insurance: "ביטוח",
  rent: "שכירות",
  other: "אחר",
};

const CATEGORY_EMOJIS: Record<string, string> = {
  electricity: "⚡",
  water: "💧",
  tax: "🏛️",
  gas: "🔥",
  phone: "📱",
  internet: "🌐",
  insurance: "🛡️",
  rent: "🏠",
  other: "📄",
};

const STATUS_STYLES: Record<string, string> = {
  unpaid: "badge-warning",
  paid: "badge-success",
  overdue: "badge-danger",
};

const STATUS_LABELS: Record<string, string> = {
  unpaid: "לא שולם",
  paid: "שולם",
  overdue: "באיחור",
};

function readBills(): Bill[] {
  if (!existsSync(BILLS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(BILLS_PATH, "utf-8"));
  } catch {
    return [];
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

export default function BillsPage() {
  const bills = readBills();
  const unpaid = bills.filter((b) => b.status !== "paid");
  const overdue = bills.filter((b) => b.status === "overdue");
  const unpaidTotal = unpaid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);

  // Sort: overdue first, then by due date
  const sorted = [...bills].sort((a, b) => {
    if (a.status === "overdue" && b.status !== "overdue") return -1;
    if (b.status === "overdue" && a.status !== "overdue") return 1;
    if (a.status === "paid" && b.status !== "paid") return 1;
    if (b.status === "paid" && a.status !== "paid") return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div>
      <h2>📄 חשבוניות ותשלומים</h2>

      {/* Summary Cards */}
      <div className="grid grid-3" style={{ marginBottom: "24px" }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: unpaid.length > 0 ? "var(--color-warning)" : undefined }}>
            {unpaid.length}
          </div>
          <div className="stat-label">לתשלום</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: overdue.length > 0 ? "var(--color-danger)" : undefined }}>
            {overdue.length > 0 ? `${overdue.length} באיחור!` : "—"}
          </div>
          <div className="stat-label">באיחור</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">~{Math.round(unpaidTotal)} ₪</div>
          <div className="stat-label">סה"כ לתשלום</div>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📄</p>
          <p style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
            אין חשבוניות רשומות עדיין
          </p>
          <p className="text-muted">
            שלח PDF של חשבון ללימור בוואטסאפ, או הוסף ידנית דרך השיחה
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="glass-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>ספק</th>
                <th>קטגוריה</th>
                <th>סכום</th>
                <th>תקופה</th>
                <th>לתשלום עד</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const days = daysUntil(b.dueDate);
                return (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>
                      {CATEGORY_EMOJIS[b.category] || "📄"} {b.vendor}
                      {b.invoiceNumber && (
                        <span className="text-muted" style={{ fontSize: "12px", display: "block" }}>
                          #{b.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td>{CATEGORY_LABELS[b.category] || b.category}</td>
                    <td style={{ fontWeight: 600 }}>{b.amount} {b.currency}</td>
                    <td>
                      {b.periodStart && b.periodEnd
                        ? `${formatDate(b.periodStart)} — ${formatDate(b.periodEnd)}`
                        : "—"
                      }
                    </td>
                    <td>
                      {formatDate(b.dueDate)}
                      {days !== null && b.status !== "paid" && (
                        <span
                          style={{
                            fontSize: "12px",
                            display: "block",
                            color: days < 0 ? "var(--color-danger)" : days <= 3 ? "var(--color-warning)" : undefined,
                          }}
                        >
                          {days < 0 ? `(${Math.abs(days)} ימים באיחור)` : days === 0 ? "(היום!)" : `(${days} ימים)`}
                        </span>
                      )}
                    </td>
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
      )}
    </div>
  );
}
