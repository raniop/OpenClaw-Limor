/**
 * Contract & Subscription Types — shared interfaces for recurring payment tracking.
 */

export type ContractCategory =
  | "internet"
  | "electricity"
  | "rent"
  | "insurance"
  | "water"
  | "tax"
  | "tv"
  | "gas"
  | "streaming"
  | "phone"
  | "other";

export type ContractBillingCycle =
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "yearly";

export type ContractStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "cancelled";

export interface Contract {
  id: string; // "cont-{timestamp36}-{random}"
  vendor: string; // e.g., "HOT", "חברת החשמל", "Netflix"
  category: ContractCategory;
  amount?: number;
  currency: string; // "ILS" | "USD" | "EUR"
  billingCycle: ContractBillingCycle;
  startDate?: string; // ISO
  endDate?: string; // ISO
  renewalDate?: string; // ISO
  autoRenew: boolean;
  status: ContractStatus;
  lastEmailId?: string; // Links to source email messageId
  lastEmailDate?: string; // ISO
  notes?: string;
  summary: string; // Hebrew one-liner for display
  terms?: string; // Hebrew summary of commercial terms (price, conditions, penalties)
  createdAt: string; // ISO
  updatedAt?: string; // ISO
}

export const CATEGORY_LABELS: Record<ContractCategory, string> = {
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

export const CATEGORY_EMOJIS: Record<ContractCategory, string> = {
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

export const BILLING_CYCLE_LABELS: Record<ContractBillingCycle, string> = {
  monthly: "חודשי",
  bimonthly: "דו-חודשי",
  quarterly: "רבעוני",
  yearly: "שנתי",
};
