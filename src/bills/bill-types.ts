/**
 * Bill/Invoice Types — specific payments for specific periods.
 * Different from contracts (ongoing commitments).
 */

export type BillCategory =
  | "electricity"
  | "water"
  | "tax"       // ארנונה
  | "gas"
  | "phone"
  | "internet"
  | "insurance"
  | "rent"
  | "other";

export type BillStatus = "unpaid" | "paid" | "overdue";

export interface Bill {
  id: string;              // "bill-{timestamp36}-{random}"
  vendor: string;          // "חברת החשמל", "עיריית ירושלים"
  category: BillCategory;
  invoiceNumber?: string;  // מספר חשבונית
  amount: number;          // סכום
  currency: string;        // ILS/USD/EUR
  periodStart?: string;    // תחילת תקופה ISO
  periodEnd?: string;      // סוף תקופה ISO
  dueDate?: string;        // מועד תשלום אחרון ISO
  status: BillStatus;
  source: "email" | "whatsapp_document" | "manual";
  summary: string;         // Hebrew one-liner
  createdAt: string;
  paidAt?: string;         // ISO — when marked as paid
}

export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
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

export const BILL_CATEGORY_EMOJIS: Record<BillCategory, string> = {
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

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  unpaid: "לא שולם",
  paid: "שולם ✅",
  overdue: "באיחור ⚠️",
};
