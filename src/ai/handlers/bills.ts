/**
 * Bill Handlers — tool implementations for bill/invoice tracking.
 */
import type { ToolHandler } from "./types";
import { getBills, addBill, markPaid, getUnpaidBills, getOverdueBills, findBillByVendor } from "../../bills/bill-store";
import { BILL_CATEGORY_LABELS, BILL_CATEGORY_EMOJIS, BILL_STATUS_LABELS } from "../../bills/bill-types";
import type { BillCategory } from "../../bills/bill-types";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}

export const billHandlers: Record<string, ToolHandler> = {
  list_bills: async (input) => {
    const bills = getBills({
      category: input.category as BillCategory | undefined,
      status: input.status,
      vendor: input.vendor,
    });

    if (bills.length === 0) {
      return "אין חשבוניות רשומות. חשבוניות יזוהו אוטומטית כששולחים PDF, או אפשר להוסיף ידנית.";
    }

    const unpaidTotal = bills
      .filter((b) => b.status !== "paid")
      .reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);

    const lines = bills.map((b) => {
      const emoji = BILL_CATEGORY_EMOJIS[b.category] || "📄";
      const cat = BILL_CATEGORY_LABELS[b.category] || b.category;
      const status = BILL_STATUS_LABELS[b.status] || b.status;
      const due = b.dueDate ? `לתשלום עד ${formatDate(b.dueDate)}` : "";
      const period = b.periodStart && b.periodEnd
        ? `תקופה: ${formatDate(b.periodStart)} — ${formatDate(b.periodEnd)}`
        : "";

      return `${emoji} **${b.vendor}** — ${b.amount} ${b.currency}\n  ${cat} | ${status}${due ? ` | ${due}` : ""}${period ? `\n  ${period}` : ""}\n  ID: ${b.id}`;
    });

    const header = unpaidTotal > 0
      ? `📄 **${bills.length} חשבוניות** | סה"כ לתשלום: ~${Math.round(unpaidTotal)} ₪`
      : `📄 **${bills.length} חשבוניות**`;

    return `${header}\n\n${lines.join("\n---\n")}`;
  },

  add_bill: async (input) => {
    const bill = addBill({
      vendor: input.vendor,
      category: (input.category || "other") as BillCategory,
      amount: input.amount,
      currency: input.currency || "ILS",
      invoiceNumber: input.invoiceNumber,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      status: "unpaid",
      source: "manual",
      summary: `חשבון ${input.vendor} — ${input.amount} ${input.currency || "₪"}`,
    });

    if (!bill) return "❌ חשבונית כפולה — כבר קיימת ברשימה.";

    const emoji = BILL_CATEGORY_EMOJIS[(input.category || "other") as BillCategory] || "📄";
    return `${emoji} נוסף חשבון: **${bill.vendor}** — ${bill.amount} ${bill.currency}\nID: ${bill.id}`;
  },

  mark_bill_paid: async (input) => {
    let bill = null;

    if (input.id) {
      bill = markPaid(input.id);
    } else if (input.vendor) {
      const found = findBillByVendor(input.vendor);
      if (found) bill = markPaid(found.id);
    }

    if (!bill) return "❌ לא מצאתי חשבון לסימון. נסה עם ID ספציפי או שם ספק.";

    return `✅ סומן כשולם: **${bill.vendor}** — ${bill.amount} ${bill.currency}`;
  },

  check_unpaid_bills: async () => {
    const unpaid = getUnpaidBills();

    if (unpaid.length === 0) {
      return "🎉 אין חשבונות לתשלום! הכל מסודר.";
    }

    const overdue = unpaid.filter((b) => b.status === "overdue");
    const total = unpaid.reduce((sum, b) => sum + (b.currency === "ILS" ? b.amount : 0), 0);

    const lines = unpaid.map((b) => {
      const emoji = BILL_CATEGORY_EMOJIS[b.category] || "📄";
      const statusIcon = b.status === "overdue" ? "🔴" : "🟡";
      const due = b.dueDate ? ` (עד ${formatDate(b.dueDate)})` : "";
      return `${statusIcon} ${emoji} ${b.vendor} — ${b.amount} ${b.currency}${due}`;
    });

    let header = `💰 **${unpaid.length} חשבונות לתשלום** — סה"כ ~${Math.round(total)} ₪`;
    if (overdue.length > 0) {
      header += `\n⚠️ **${overdue.length} באיחור!**`;
    }

    return `${header}\n\n${lines.join("\n")}`;
  },
};
