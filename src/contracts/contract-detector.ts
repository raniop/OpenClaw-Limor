/**
 * Contract Detector — identifies recurring subscriptions and bills from emails.
 * Two-stage pipeline:
 *  1. Regex pre-filter (fast, zero cost) — only likely contracts proceed
 *  2. Claude Sonnet extraction (AI, ~$0.001/email) — structured data
 */
import { client as aiClient } from "../ai/client";
import { SONNET } from "../ai/model-router";
import type { ParsedEmail } from "../email/email-types";
import type { Contract, ContractCategory, ContractBillingCycle } from "./contract-types";
import type { Bill, BillCategory } from "../bills/bill-types";

/** Result of document classification — either a contract, a bill, or nothing */
export type DocumentDetectionResult =
  | { type: "contract"; data: Omit<Contract, "id" | "createdAt"> }
  | { type: "bill"; data: Omit<Bill, "id" | "createdAt"> }
  | null;

const VALID_BILL_CATEGORIES: BillCategory[] = [
  "electricity", "water", "tax", "gas", "phone", "internet", "tv", "streaming", "insurance", "rent", "other",
];

// ─── Stage 1: Regex Pre-Filter ────────────────────────────────────────

const CONTRACT_SENDER_DOMAINS = [
  // Israeli utilities
  "iec.co.il", "israel-electric.co.il",     // Israel Electric Corporation
  "mekorot.co.il",                           // Water (national)
  "hagihon.co.il",                           // Jerusalem water
  "mei-avivim.co.il",                        // Tel Aviv water
  // Telco / Internet / TV
  "hot.net.il", "hotmobile.co.il",
  "partner.co.il",
  "bezeq.co.il", "bezeqint.net",
  "cellcom.co.il",
  "012.net.il",
  "yes.co.il",
  "pelephone.co.il",
  "golan-telecom.co.il",
  "we4g.co.il",
  // Insurance
  "clal.co.il", "clalbit.co.il",
  "harel-group.co.il", "harel.co.il",
  "migdal.co.il",
  "menora.co.il",
  "phoenix.co.il", "the-phoenix.co.il",
  "ayalon-ins.co.il",
  "shirbit.co.il",
  // Streaming
  "netflix.com",
  "spotify.com",
  "apple.com",
  "disneyplus.com", "disney.com",
  "hbomax.com", "max.com",
  "primevideo.com",
  // Municipal
  "jerusalem.muni.il",
  "tel-aviv.gov.il", "tlv.gov.il",
  "rishonlezion.muni.il",
  "haifa.muni.il",
  // Gas
  "supergas.co.il",
  "pazgas.co.il",
  "amerigas.co.il",
  // Rent / Property
  "weiss-properties.co.il",
  "azorim.co.il",
  // Other subscriptions
  "github.com",
  "openai.com",
  "anthropic.com",
  "notion.so",
  "figma.com",
  "canva.com",
  "dropbox.com",
  "google.com", // Google One, Workspace
];

const CONTRACT_SUBJECT_PATTERNS = [
  /חשבונית|חשבון\s*חודשי|חשבון\s*תקופתי/i,
  /bill|invoice|statement|receipt/i,
  /חידוש|renewal|renew/i,
  /מנוי|subscription/i,
  /תשלום\s*חודשי|monthly\s*payment|recurring/i,
  /פוליסת?|policy|insurance|ביטוח/i,
  /ארנונה|מים|חשמל|גז|אינטרנט/i,
  /your\s*(monthly|annual|yearly)\s*(plan|subscription|bill)/i,
  /payment\s*(confirmation|received|processed)/i,
  /דמי\s*שכירות|שכ"ד|rent/i,
];

/**
 * Fast check: is this email likely a contract/subscription/bill?
 */
export function isLikelyContract(email: ParsedEmail): boolean {
  // Check sender domain
  const fromDomain = email.fromAddress.split("@")[1]?.toLowerCase() || "";
  if (CONTRACT_SENDER_DOMAINS.some((d) => fromDomain.includes(d))) {
    return true;
  }

  // Check subject patterns
  if (CONTRACT_SUBJECT_PATTERNS.some((p) => p.test(email.subject))) {
    return true;
  }

  // Check body for billing keywords (first 500 chars)
  const bodySnippet = email.textBody.substring(0, 500).toLowerCase();
  const billingKeywords = ["חשבון חודשי", "תשלום חודשי", "מנוי", "monthly bill", "subscription", "recurring payment", "ארנונה", "חברת חשמל"];
  if (billingKeywords.some((k) => bodySnippet.includes(k))) {
    return true;
  }

  return false;
}

// ─── Stage 2: AI Extraction ───────────────────────────────────────────

const EXTRACT_PROMPT = `You are analyzing a document to classify it and extract financial data.

Classify the document into ONE of these types:
1. CONTRACT — ongoing subscription/commitment (e.g., internet plan, insurance policy, Netflix, rent agreement). Has recurring billing, terms, renewal dates.
2. BILL — specific invoice/payment for a period (e.g., electricity bill for January, water bill Q1, municipal tax). Has a specific amount for a specific period with a due date.
3. NEITHER — marketing, spam, one-time purchase receipt, etc.

If CONTRACT, return:
{
  "type": "contract",
  "vendor": "vendor name (use common Hebrew name if Israeli company)",
  "category": "internet|electricity|rent|insurance|water|tax|tv|gas|streaming|phone|other",
  "amount": number or null,
  "currency": "ILS" or "USD" or "EUR",
  "billingCycle": "monthly" or "bimonthly" or "quarterly" or "yearly",
  "renewalDate": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "autoRenew": true or false,
  "summaryHe": "one-line Hebrew summary",
  "termsHe": "Hebrew summary of key terms (2-3 lines) or null"
}

If BILL, return:
{
  "type": "bill",
  "vendor": "vendor name (use common Hebrew name if Israeli company)",
  "category": "electricity|water|tax|gas|phone|internet|tv|streaming|insurance|rent|other",
  "invoiceNumber": "invoice number string or null",
  "amount": number,
  "currency": "ILS" or "USD" or "EUR",
  "periodStart": "YYYY-MM-DD" or null,
  "periodEnd": "YYYY-MM-DD" or null,
  "dueDate": "YYYY-MM-DD" or null,
  "isPaid": true if the document indicates payment was already made or will be auto-charged (look for: "שולם", "לא לתשלום", "ישולם באמצעות כרטיס אשראי", "חויב", "נגבה", "paid", "auto-pay", "direct debit", "הוראת קבע"). false if unpaid.,
  "summaryHe": "one-line Hebrew summary (e.g., חשבון חשמל ינואר 2026 — 450 ₪)"
}

If NEITHER, return:
{"type": "neither"}

Return ONLY valid JSON, nothing else.`;

const VALID_CATEGORIES: ContractCategory[] = [
  "internet", "electricity", "rent", "insurance", "water",
  "tax", "tv", "gas", "streaming", "phone", "other",
];

const VALID_CYCLES: ContractBillingCycle[] = [
  "monthly", "bimonthly", "quarterly", "yearly",
];

/**
 * Core AI extraction — classifies document as contract, bill, or neither.
 * Works with any text content (email, PDF, etc.)
 */
export async function detectDocumentFromText(
  content: string,
  source: "email" | "whatsapp_document" | "manual",
  fallbackVendor?: string
): Promise<DocumentDetectionResult> {
  try {
    const response = await aiClient.messages.create({
      model: SONNET,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `${EXTRACT_PROMPT}\n\n--- DOCUMENT ---\n${content.substring(0, 2500)}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.type === "contract") {
      const category: ContractCategory = VALID_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : "other";
      const billingCycle: ContractBillingCycle = VALID_CYCLES.includes(parsed.billingCycle)
        ? parsed.billingCycle
        : "monthly";

      return {
        type: "contract",
        data: {
          vendor: parsed.vendor || fallbackVendor || "לא ידוע",
          category,
          amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
          currency: parsed.currency || "ILS",
          billingCycle,
          startDate: undefined,
          endDate: parsed.endDate || undefined,
          renewalDate: parsed.renewalDate || undefined,
          autoRenew: parsed.autoRenew !== false,
          status: "active",
          source,
          summary: parsed.summaryHe || `${parsed.vendor} — ${category}`,
          terms: parsed.termsHe || undefined,
        },
      };
    }

    if (parsed.type === "bill") {
      const category: BillCategory = VALID_BILL_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : "other";

      return {
        type: "bill",
        data: {
          vendor: parsed.vendor || fallbackVendor || "לא ידוע",
          category,
          invoiceNumber: parsed.invoiceNumber || undefined,
          amount: typeof parsed.amount === "number" ? parsed.amount : 0,
          currency: parsed.currency || "ILS",
          periodStart: parsed.periodStart || undefined,
          periodEnd: parsed.periodEnd || undefined,
          dueDate: parsed.dueDate || undefined,
          status: parsed.isPaid ? "paid" : "unpaid",
          paidAt: parsed.isPaid ? new Date().toISOString() : undefined,
          source,
          summary: parsed.summaryHe || `חשבון ${parsed.vendor}`,
        },
      };
    }

    // "neither" or unrecognized
    return null;
  } catch (err) {
    console.error("[contracts] Detection failed:", err);
    return null;
  }
}

/** Legacy wrapper — detects contracts only (used by email poller) */
export async function detectContractFromText(
  content: string,
  source: "email" | "whatsapp_document" | "manual",
  fallbackVendor?: string
): Promise<Omit<Contract, "id" | "createdAt"> | null> {
  const result = await detectDocumentFromText(content, source, fallbackVendor);
  if (result?.type === "contract") return result.data;
  return null;
}

/**
 * Detect contract from an email (wrapper around detectContractFromText).
 */
export async function detectContract(
  email: ParsedEmail
): Promise<Omit<Contract, "id" | "createdAt"> | null> {
  const emailContent = [
    `From: ${email.from} <${email.fromAddress}>`,
    `Subject: ${email.subject}`,
    `Date: ${email.date}`,
    ``,
    email.textBody.substring(0, 1500),
  ].join("\n");

  const result = await detectContractFromText(emailContent, "email", email.from);
  if (result) {
    result.lastEmailId = email.messageId;
    result.lastEmailDate = email.date;
  }
  return result;
}
