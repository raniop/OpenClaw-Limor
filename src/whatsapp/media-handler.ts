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
  /** If set, reply with this text directly and skip AI processing */
  directReply?: string;
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

        // PDF contract/bill detection — respond directly without AI to avoid context contamination
        let directReply: string | undefined;
        if (filename.toLowerCase().endsWith(".pdf")) {
          try {
            const docResult = await processDocumentForContract(buffer, filename);
            if (docResult) {
              const catLabel = docResult.type === "bill"
                ? (BILL_CATEGORY_LABELS as any)[docResult.category] || docResult.category
                : (CATEGORY_LABELS as any)[docResult.category] || docResult.category;
              const amountStr = docResult.amount
                ? `₪${docResult.amount.toLocaleString("he-IL")}`
                : "";
              const periodStr = docResult.periodEnd
                ? new Date(docResult.periodEnd).toLocaleDateString("he-IL", { month: "long", year: "numeric" })
                : "";
              const paidStr = docResult.isPaid ? "\n💳 שולם אוטומטית" : "";

              if (docResult.duplicate) {
                directReply = `📄 חשבון ${catLabel} מ-*${docResult.vendor}*${periodStr ? ` (${periodStr})` : ""} — ${amountStr} — כבר קיים במערכת, לא נשמר שוב.`;
              } else if (docResult.type === "bill") {
                directReply = `✅ *חשבון ${catLabel} נשמר!*\n🏢 ספק: ${docResult.vendor}${periodStr ? `\n📅 תקופה: ${periodStr}` : ""}\n💰 סכום: ${amountStr}${paidStr}`;
              } else {
                directReply = `✅ *חוזה ${catLabel} נשמר!*\n🏢 ספק: ${docResult.vendor}\n📋 ${docResult.summary || ""}${amountStr ? `\n💰 סכום: ${amountStr}` : ""}`;
              }
              // Set body to empty so AI is not called
              body = "";
            }
          } catch (err) {
            console.error("[pdf] Contract detection error:", err);
          }
        }
        if (!body && !directReply) body = `[קובץ: ${filename}]`;
        if (directReply) {
          return { result: { body: body || "[קובץ מעובד]", imageData, directReply } };
        }
      }
    } catch (err) {
      log.mediaError("document", String(err));
    }
  }

  return { result: { body, imageData } };
}
