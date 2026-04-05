/**
 * PDF Document Processor — parses PDF documents and extracts contract OR bill data.
 * Routes to the appropriate store based on AI classification.
 */
import { detectDocumentFromText } from "./contract-detector";
import type { DocumentDetectionResult } from "./contract-detector";
import { addContract } from "./contract-store";
import { addBill } from "../bills/bill-store";
import type { Contract } from "./contract-types";
import type { Bill } from "../bills/bill-types";

const pdfParse = require("pdf-parse");

/**
 * Extract text content from a PDF buffer.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    console.error("[pdf] Text extraction failed:", err);
    return "";
  }
}

/** Result of processing a document */
export interface DocumentProcessResult {
  type: "contract" | "bill";
  vendor: string;
  category: string;
  amount?: number;
  currency?: string;
  periodEnd?: string;
  summary: string;
  duplicate?: boolean;
  isPaid?: boolean;
  saved?: Contract | Bill;
}

/**
 * Process a PDF document: extract text, classify as contract or bill, save accordingly.
 */
export async function processDocumentForContract(
  buffer: Buffer,
  filename: string
): Promise<DocumentProcessResult | null> {
  const text = await extractTextFromPdf(buffer);
  if (!text || text.length < 20) {
    console.log(`[pdf] Too little text extracted from ${filename} (${text.length} chars)`);
    return null;
  }

  console.log(`[pdf] Extracted ${text.length} chars from ${filename}`);

  const result = await detectDocumentFromText(
    text,
    "whatsapp_document",
    filename.replace(/\.pdf$/i, "")
  );

  if (!result) {
    console.log(`[pdf] No contract/bill detected in ${filename}`);
    return null;
  }

  if (result.type === "contract") {
    const saved = addContract(result.data);
    if (saved) {
      console.log(`[pdf] Contract saved: ${saved.vendor} (${saved.category}) — ${saved.summary}`);
      return {
        type: "contract",
        vendor: saved.vendor,
        category: saved.category,
        amount: saved.amount,
        currency: saved.currency,
        summary: saved.summary,
        saved,
      };
    }
    console.log(`[pdf] Duplicate contract: ${result.data.vendor}`);
    return {
      type: "contract",
      vendor: result.data.vendor,
      category: result.data.category,
      amount: result.data.amount,
      currency: result.data.currency,
      summary: result.data.summary,
      duplicate: true,
    };
  }

  if (result.type === "bill") {
    const saved = addBill(result.data);
    if (saved) {
      console.log(`[pdf] Bill saved: ${saved.vendor} ${saved.amount} ${saved.currency} — ${saved.summary}`);
      return {
        type: "bill",
        vendor: saved.vendor,
        category: saved.category,
        amount: saved.amount,
        currency: saved.currency,
        periodEnd: saved.periodEnd,
        summary: saved.summary,
        isPaid: saved.status === "paid",
        saved,
      };
    }
    console.log(`[pdf] Duplicate bill: ${result.data.vendor}`);
    return {
      type: "bill",
      vendor: result.data.vendor,
      category: result.data.category,
      amount: result.data.amount,
      currency: result.data.currency,
      periodEnd: result.data.periodEnd,
      summary: result.data.summary,
      isPaid: result.data.status === "paid",
      duplicate: true,
    };
    return null;
  }

  return null;
}
