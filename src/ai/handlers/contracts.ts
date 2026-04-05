/**
 * Contract Handlers — tool implementations for contract and subscription tracking.
 */
import type { ToolHandler } from "./types";
import {
  getContracts,
  addContract,
  updateContract,
  getExpiringContracts,
} from "../../contracts/contract-store";
import {
  CATEGORY_LABELS,
  CATEGORY_EMOJIS,
  BILLING_CYCLE_LABELS,
} from "../../contracts/contract-types";
import type { ContractCategory, ContractBillingCycle, ContractStatus } from "../../contracts/contract-types";

const STATUS_LABELS: Record<ContractStatus, string> = {
  active: "פעיל ✅",
  expiring_soon: "מתחדש בקרוב ⚠️",
  expired: "פג תוקף ❌",
  cancelled: "בוטל 🚫",
};

export const contractHandlers: Record<string, ToolHandler> = {
  list_contracts: async (input) => {
    const contracts = getContracts({
      category: input.category as ContractCategory | undefined,
      status: input.status as ContractStatus | undefined,
    });

    if (contracts.length === 0) {
      return "אין חוזים או מנויים רשומים. אפשר להוסיף ידנית עם add_contract, או שהם יזוהו אוטומטית ממיילים.";
    }

    // Calculate totals
    let monthlyTotal = 0;
    for (const c of contracts) {
      if (c.status === "cancelled" || !c.amount) continue;
      switch (c.billingCycle) {
        case "monthly": monthlyTotal += c.amount; break;
        case "bimonthly": monthlyTotal += c.amount / 2; break;
        case "quarterly": monthlyTotal += c.amount / 3; break;
        case "yearly": monthlyTotal += c.amount / 12; break;
      }
    }

    const lines = contracts.map((c) => {
      const emoji = CATEGORY_EMOJIS[c.category] || "📋";
      const cat = CATEGORY_LABELS[c.category] || c.category;
      const amount = c.amount ? `${c.amount} ${c.currency}` : "לא צוין";
      const cycle = BILLING_CYCLE_LABELS[c.billingCycle] || c.billingCycle;
      const renewal = c.renewalDate
        ? new Date(c.renewalDate).toLocaleDateString("he-IL")
        : c.endDate
        ? new Date(c.endDate).toLocaleDateString("he-IL")
        : "לא ידוע";
      const status = STATUS_LABELS[c.status] || c.status;

      const termsLine = c.terms ? `\n  תנאים: ${c.terms}` : "";
      return `${emoji} **${c.vendor}** (${cat})\n  סכום: ${amount} / ${cycle}\n  חידוש: ${renewal}\n  סטטוס: ${status}${termsLine}\n  ID: ${c.id}`;
    });

    const header = `📋 **${contracts.length} חוזים/מנויים** | עלות חודשית משוערת: ~${Math.round(monthlyTotal)} ₪`;
    return `${header}\n\n${lines.join("\n---\n")}`;
  },

  add_contract: async (input) => {
    const contract = addContract({
      vendor: input.vendor,
      category: (input.category || "other") as ContractCategory,
      amount: input.amount,
      currency: input.currency || "ILS",
      billingCycle: (input.billingCycle || "monthly") as ContractBillingCycle,
      renewalDate: input.renewalDate,
      endDate: input.endDate,
      autoRenew: input.autoRenew !== false,
      status: "active",
      notes: input.notes,
      summary: `${input.vendor} — ${CATEGORY_LABELS[(input.category || "other") as ContractCategory] || input.category}`,
    });

    if (!contract) {
      return "❌ לא הצלחתי להוסיף את החוזה.";
    }

    const emoji = CATEGORY_EMOJIS[contract.category] || "📋";
    return `${emoji} נוסף: **${contract.vendor}** (${CATEGORY_LABELS[contract.category]})\nID: ${contract.id}`;
  },

  update_contract: async (input) => {
    const { id, ...updates } = input;
    if (!id) return "❌ חסר מזהה חוזה (id).";

    const updated = updateContract(id, updates);
    if (!updated) return `❌ לא נמצא חוזה עם ID: ${id}`;

    return `✅ עודכן: **${updated.vendor}** (${CATEGORY_LABELS[updated.category]})\nסטטוס: ${STATUS_LABELS[updated.status]}`;
  },

  check_renewals: async (input) => {
    const days = input.days || 30;
    const expiring = getExpiringContracts(days);

    if (expiring.length === 0) {
      return `אין חוזים שמתחדשים ב-${days} הימים הקרובים.`;
    }

    const lines = expiring.map((c) => {
      const emoji = CATEGORY_EMOJIS[c.category] || "📋";
      const targetDate = c.endDate || c.renewalDate;
      const daysLeft = targetDate
        ? Math.ceil((new Date(targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : "?";
      const amount = c.amount ? `${c.amount} ${c.currency}` : "";

      return `${emoji} **${c.vendor}** — בעוד ${daysLeft} ימים${amount ? ` (${amount})` : ""}`;
    });

    return `⚠️ **${expiring.length} חוזים מתחדשים ב-${days} ימים הקרובים:**\n\n${lines.join("\n")}`;
  },
};
