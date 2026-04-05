/**
 * Media message processing — voice transcription, image extraction, document saving.
 * PDF documents are automatically scanned for contract/subscription data.
 */
import { transcribeAudio } from "../transcribe";
import { saveFile } from "../files";
import { log } from "../logger";
import { processDocumentForContract } from "../contracts/pdf-extractor";
import { CATEGORY_LABELS } from "../contracts/contract-types";
import { BILL_CATEGORY_LABELS } from "../bills/bill-types";

export interface MediaResult {
  body: string;
  imageData?: { base64: string; mediaType: string };
}

/**
 * Process media from a WhatsApp message.
 * Returns updated body text and optional image data.
 * Returns null if voice transcription fails (caller should reply with error).
 */
export async function processMedia(
  msg: { hasMedia: boolean; type: string; body: string; downloadMedia: () => Promise<any> }
): Promise<{ result: MediaResult } | { error: string }> {
  let body = msg.body.trim();
  let imageData: { base64: string; mediaType: string } | undefined;
  const isVoice = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio");

  // Voice messages
  if (isVoice) {
    try {
      const media = await msg.downloadMedia();
      if (media && media.data) {
        const buffer = Buffer.from(media.data, "base64");
        log.mediaVoice();
        body = await transcribeAudio(buffer, media.mimetype);
        log.mediaVoiceResult(body);
      }
    } catch (err) {
      log.mediaError("voice", String(err));
      return { error: "לא הצלחתי להבין את ההודעה הקולית 😅 אפשר לנסות שוב או לכתוב?" };
    }
  }

  // Image messages
  if (msg.hasMedia && msg.type === "image") {
    try {
      const media = await msg.downloadMedia();
      if (media && media.data) {
        log.mediaImage();
        imageData = { base64: media.data, mediaType: media.mimetype };
        if (!body) body = "[תמונה]";
      }
    } catch (err) {
      log.mediaError("image", String(err));
    }
  }

  // Document messages
  if (msg.hasMedia && msg.type === "document") {
    try {
      const media = await msg.downloadMedia();
      if (media && media.data) {
        const filename = (media as any).filename || `document_${Date.now()}`;
        const buffer = Buffer.from(media.data, "base64");
        saveFile(filename, buffer);
        log.mediaDocument(filename);

        // PDF contract detection — extract billing data from PDF documents
        if (filename.toLowerCase().endsWith(".pdf")) {
          try {
            const docResult = await processDocumentForContract(buffer, filename);
            if (docResult) {
              const amountStr = docResult.amount ? ` ${docResult.amount} ${docResult.currency || "₪"}` : "";
              const catLabel = docResult.type === "bill"
                ? (BILL_CATEGORY_LABELS as any)[docResult.category] || docResult.category
                : (CATEGORY_LABELS as any)[docResult.category] || docResult.category;
              const summaryText = docResult.summary || `${docResult.vendor}${amountStr}`;
              const paidNote = (docResult.saved as any)?.status === "paid" ? " (שולם אוטומטית)" : "";
              if (docResult.duplicate) {
                body = `המשתמש שלח קובץ PDF: ${filename}. זה ${docResult.type === "bill" ? "חשבון" : "חוזה"} ${catLabel} מ${docResult.vendor}${amountStr} שכבר קיים במערכת. תגידי לו בקצרה שהחשבון הזה כבר ברשימה, לא צריך לשלוח שוב.`;
              } else if (docResult.type === "bill") {
                body = `המשתמש שלח קובץ PDF: ${filename}. זיהיתי ושמרתי אוטומטית חשבון ${catLabel} — ${summaryText}${paidNote}. תגידי לו בקצרה מה זיהית ושנשמר. אין צורך ב-add_bill כי כבר נשמר.`;
              } else {
                body = `המשתמש שלח קובץ PDF: ${filename}. זיהיתי ושמרתי אוטומטית חוזה ${catLabel} — ${summaryText}. תגידי לו בקצרה מה זיהית ושנשמר. אין צורך ב-add_contract כי כבר נשמר.`;
              }
            } else {
              if (!body) body = `[קובץ: ${filename}]`;
            }
          } catch (err) {
            console.error("[pdf] Contract detection error:", err);
            if (!body) body = `[קובץ: ${filename}]`;
          }
        } else {
          if (!body) body = `[קובץ: ${filename}]`;
        }
      }
    } catch (err) {
      log.mediaError("document", String(err));
    }
  }

  return { result: { body, imageData } };
}
