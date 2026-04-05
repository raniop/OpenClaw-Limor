/**
 * PDF Bill Extractor — parses PDF documents and extracts contract/subscription data.
 * Used when owner sends a PDF bill via WhatsApp.
 */
import { detectContractFromText } from "./contract-detector";
import { addContract } from "./contract-store";
import type { Contract } from "./contract-types";

// Use require for pdf-parse (no TS types)
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

/**
 * Process a PDF document: extract text, detect contract, save if found.
 * Returns the saved contract or null.
 */
export async function processDocumentForContract(
  buffer: Buffer,
  filename: string
): Promise<Contract | null> {
  const text = await extractTextFromPdf(buffer);
  if (!text || text.length < 20) {
    console.log(`[pdf] Too little text extracted from ${filename} (${text.length} chars)`);
    return null;
  }

  console.log(`[pdf] Extracted ${text.length} chars from ${filename}`);

  const contractData = await detectContractFromText(
    text,
    "whatsapp_document",
    filename.replace(/\.pdf$/i, "")
  );

  if (!contractData) {
    console.log(`[pdf] No contract detected in ${filename}`);
    return null;
  }

  const saved = addContract(contractData);
  if (saved) {
    console.log(`[pdf] Contract saved: ${saved.vendor} (${saved.category}) — ${saved.summary}`);
  }
  return saved;
}
