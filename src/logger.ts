/**
 * Structured logger for Limor.
 * Outputs JSON-like structured lines to stdout/stderr.
 * Does NOT log secrets, tokens, or sensitive file contents.
 */

type LogLevel = "info" | "warn" | "error" | "debug";
type LogDomain = "msg" | "tool" | "approval" | "api" | "system" | "media" | "memory";

interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

function formatLine(level: LogLevel, domain: LogDomain, message: string, ctx?: LogContext): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${domain}]`;
  if (!ctx || Object.keys(ctx).length === 0) {
    return `${prefix} ${message}`;
  }
  const pairs = Object.entries(ctx)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === "string" ? `"${v}"` : v}`)
    .join(" ");
  return `${prefix} ${message} | ${pairs}`;
}

function write(level: LogLevel, domain: LogDomain, message: string, ctx?: LogContext): void {
  const line = formatLine(level, domain, message, ctx);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  // --- Message flow ---
  msgReceived(chatId: string, contactName: string, phone: string, type: string) {
    write("info", "msg", "Message received", { chatId, contact: contactName, phone: `+${phone}`, type });
  },
  msgSkipGroup(contactName: string) {
    write("debug", "msg", "Skipping group message (SKIP response)", { contact: contactName });
  },
  msgReact(emoji: string, contactName: string) {
    write("info", "msg", "Reacted", { emoji, contact: contactName });
  },

  // --- Media ---
  mediaVoice() {
    write("info", "media", "Voice message received, transcribing");
  },
  mediaVoiceResult(text: string) {
    write("info", "media", "Transcription complete", { length: text.length });
  },
  mediaImage() {
    write("info", "media", "Image received");
  },
  mediaDocument(filename: string) {
    write("info", "media", "Document saved", { filename });
  },
  mediaError(type: string, error: string) {
    write("error", "media", `${type} processing failed`, { error });
  },

  // --- Tool calls ---
  toolCall(name: string, result: string) {
    write("info", "tool", `Tool executed: ${name}`, { resultPreview: result.substring(0, 150) });
  },

  // --- Approval ---
  approvalNewContact(contactName: string, phone: string, code: string) {
    write("info", "approval", "New contact pending approval", { contact: contactName, phone, code });
  },
  approvalApproved(code: string, phone: string) {
    write("info", "approval", "Contact approved", { code, phone });
  },
  approvalRejected(code: string, phone: string) {
    write("info", "approval", "Contact rejected", { code, phone });
  },
  approvalNotFound(code: string) {
    write("warn", "approval", "Approval code not found", { code });
  },
  approvalAmbiguous(count: number) {
    write("warn", "approval", "Ambiguous approval — multiple pending", { count });
  },
  meetingApproved(id: string, requester: string) {
    write("info", "approval", "Meeting approved", { id, requester });
  },
  meetingRejected(id: string, requester: string) {
    write("info", "approval", "Meeting rejected", { id, requester });
  },

  // --- API ---
  apiRetry(attempt: number, maxRetries: number, delayMs: number) {
    write("warn", "api", "API overloaded, retrying", { attempt, maxRetries, delayMs });
  },

  // --- Memory ---
  memoryExtractFailed(error: string) {
    write("error", "memory", "Fact extraction failed", { error });
  },
  memorySaveError(error: string) {
    write("error", "memory", "Memory save failed", { error });
  },

  // --- System ---
  systemStarting() {
    write("info", "system", "Starting Limor (לימור)...");
  },
  systemReady() {
    write("info", "system", "לימור מחוברת ומוכנה! (Limor is ready!)");
  },
  systemShutdown() {
    write("info", "system", "Shutting down Limor...");
  },
  systemError(message: string, error?: string) {
    write("error", "system", message, error ? { error } : undefined);
  },
};
