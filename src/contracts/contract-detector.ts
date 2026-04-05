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

const EXTRACT_PROMPT = `You are analyzing an email to determine if it relates to a recurring subscription, utility bill, or contract.
If it IS a contract/subscription/bill, extract the following as JSON:
{
  "isContract": true,
  "vendor": "vendor name (use common Hebrew name if Israeli company)",
  "category": "internet|electricity|rent|insurance|water|tax|tv|gas|streaming|phone|other",
  "amount": number or null,
  "currency": "ILS" or "USD" or "EUR",
  "billingCycle": "monthly" or "bimonthly" or "quarterly" or "yearly",
  "renewalDate": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "autoRenew": true or false (default true for utilities),
  "summaryHe": "one-line Hebrew summary of this contract/subscription",
  "termsHe": "Hebrew summary of key commercial terms: price breakdown, commitment period, cancellation fee, special conditions. 2-3 short lines. If no terms visible, null."
}
If NOT a contract/subscription/bill (e.g., marketing email, one-time purchase, spam), return:
{"isContract": false}
Return ONLY valid JSON, nothing else.`;

const VALID_CATEGORIES: ContractCategory[] = [
  "internet", "electricity", "rent", "insurance", "water",
  "tax", "tv", "gas", "streaming", "phone", "other",
];

const VALID_CYCLES: ContractBillingCycle[] = [
  "monthly", "bimonthly", "quarterly", "yearly",
];

/**
 * Use Claude Sonnet to extract contract details from an email.
 * Returns null if not a contract or extraction fails.
 */
export async function detectContract(
  email: ParsedEmail
): Promise<Omit<Contract, "id" | "createdAt"> | null> {
  try {
    const emailContent = [
      `From: ${email.from} <${email.fromAddress}>`,
      `Subject: ${email.subject}`,
      `Date: ${email.date}`,
      ``,
      email.textBody.substring(0, 1500), // Limit to save tokens
    ].join("\n");

    const response = await aiClient.messages.create({
      model: SONNET,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `${EXTRACT_PROMPT}\n\n--- EMAIL ---\n${emailContent}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.isContract) return null;

    // Validate and normalize
    const category: ContractCategory = VALID_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "other";

    const billingCycle: ContractBillingCycle = VALID_CYCLES.includes(parsed.billingCycle)
      ? parsed.billingCycle
      : "monthly";

    return {
      vendor: parsed.vendor || email.from,
      category,
      amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
      currency: parsed.currency || "ILS",
      billingCycle,
      startDate: undefined,
      endDate: parsed.endDate || undefined,
      renewalDate: parsed.renewalDate || undefined,
      autoRenew: parsed.autoRenew !== false,
      status: "active",
      lastEmailId: email.messageId,
      lastEmailDate: email.date,
      summary: parsed.summaryHe || `${parsed.vendor} — ${category}`,
      terms: parsed.termsHe || undefined,
    };
  } catch (err) {
    console.error("[contracts] Detection failed:", err);
    return null;
  }
}
