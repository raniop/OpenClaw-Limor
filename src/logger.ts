/**
 * Structured logger for Limor.
 * Outputs structured lines to stdout/stderr AND to a rotating log file
 * at workspace/state/limor.log (read by the dashboard).
 */
import { appendFileSync, existsSync, statSync, renameSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import type { TraceContext, NormalizedError } from "./observability/types";

type LogLevel = "info" | "warn" | "error" | "debug";
type LogDomain = "msg" | "tool" | "approval" | "api" | "system" | "media" | "memory" | "trace";

interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

const LOG_PATH = resolve(__dirname, "..", "workspace", "state", "limor.log");
const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2MB — rotate when exceeded

function ensureLogDir(): void {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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

function writeToFile(line: string): void {
  try {
    ensureLogDir();
    // Rotate if too large
    if (existsSync(LOG_PATH)) {
      const stats = statSync(LOG_PATH);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = LOG_PATH + ".1";
        try { renameSync(LOG_PATH, backupPath); } catch {}
      }
    }
    appendFileSync(LOG_PATH, line + "\n", "utf-8");
  } catch {
    // Silently fail — don't break the bot for log I/O errors
  }
}

function write(level: LogLevel, domain: LogDomain, message: string, ctx?: LogContext): void {
  const line = formatLine(level, domain, message, ctx);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
  writeToFile(line);
}

/** Build context with trace info merged in. */
function withTrace(trace: TraceContext | undefined, extra?: LogContext): LogContext {
  const base: LogContext = {};
  if (trace) {
    base.traceId = trace.traceId;
    base.chatId = trace.chatId;
  }
  return { ...base, ...extra };
}

export const log = {
  // --- Trace lifecycle ---
  traceStart(trace: TraceContext) {
    write("info", "trace", "Message flow started", {
      traceId: trace.traceId,
      chatId: trace.chatId,
      contact: trace.contactName,
      isGroup: trace.isGroup,
      isOwner: trace.isOwner,
    });
  },
  traceEnd(trace: TraceContext, outcome: string, durationMs: number) {
    write("info", "trace", `Message flow completed: ${outcome}`, {
      traceId: trace.traceId,
      chatId: trace.chatId,
      durationMs,
      outcome,
    });
  },
  traceError(trace: TraceContext, err: NormalizedError, durationMs: number) {
    write("error", "trace", `Message flow failed: ${err.operation}`, {
      traceId: trace.traceId,
      chatId: trace.chatId,
      durationMs,
      error: err.message,
      operation: err.operation,
    });
  },

  // --- Message flow ---
  msgReceived(chatId: string, contactName: string, phone: string, type: string, trace?: TraceContext) {
    write("info", "msg", "Message received", withTrace(trace, { contact: contactName, phone: `+${phone}`, type }));
  },
  msgSkipGroup(contactName: string, trace?: TraceContext) {
    write("debug", "msg", "Skipping group message (SKIP response)", withTrace(trace, { contact: contactName }));
  },
  msgReact(emoji: string, contactName: string, trace?: TraceContext) {
    write("info", "msg", "Reacted", withTrace(trace, { emoji, contact: contactName }));
  },
  msgResponse(type: string, durationMs: number, trace?: TraceContext) {
    write("info", "msg", `Response dispatched: ${type}`, withTrace(trace, { responseType: type, durationMs }));
  },

  // --- Media ---
  mediaVoice(trace?: TraceContext) {
    write("info", "media", "Voice message received, transcribing", withTrace(trace));
  },
  mediaVoiceResult(text: string, durationMs?: number, trace?: TraceContext) {
    write("info", "media", "Transcription complete", withTrace(trace, { length: text.length, durationMs }));
  },
  mediaImage(trace?: TraceContext) {
    write("info", "media", "Image received", withTrace(trace));
  },
  mediaDocument(filename: string, trace?: TraceContext) {
    write("info", "media", "Document saved", withTrace(trace, { filename }));
  },
  mediaError(type: string, error: string, trace?: TraceContext) {
    write("error", "media", `${type} processing failed`, withTrace(trace, { error }));
  },

  // --- Tool calls ---
  toolCall(name: string, result: string, durationMs?: number, trace?: TraceContext) {
    write("info", "tool", `Tool executed: ${name}`, withTrace(trace, { tool: name, resultPreview: result.substring(0, 120), durationMs }));
  },
  toolError(name: string, error: string, durationMs?: number, trace?: TraceContext) {
    write("error", "tool", `Tool failed: ${name}`, withTrace(trace, { tool: name, error, durationMs }));
  },

  // --- AI ---
  aiRequestStart(trace?: TraceContext) {
    write("info", "api", "AI request started", withTrace(trace));
  },
  aiRequestEnd(durationMs: number, toolCalls: number, trace?: TraceContext) {
    write("info", "api", "AI request completed", withTrace(trace, { durationMs, toolCalls }));
  },
  aiRequestError(error: string, durationMs: number, trace?: TraceContext) {
    write("error", "api", "AI request failed", withTrace(trace, { error, durationMs }));
  },

  // --- Approval ---
  approvalNewContact(contactName: string, phone: string, code: string, trace?: TraceContext) {
    write("info", "approval", "New contact pending approval", withTrace(trace, { contact: contactName, phone, code }));
  },
  approvalApproved(code: string, phone: string, trace?: TraceContext) {
    write("info", "approval", "Contact approved", withTrace(trace, { code, phone }));
  },
  approvalRejected(code: string, phone: string, trace?: TraceContext) {
    write("info", "approval", "Contact rejected", withTrace(trace, { code, phone }));
  },
  approvalNotFound(code: string, trace?: TraceContext) {
    write("warn", "approval", "Approval code not found", withTrace(trace, { code }));
  },
  approvalAmbiguous(count: number, trace?: TraceContext) {
    write("warn", "approval", "Ambiguous approval — multiple pending", withTrace(trace, { count }));
  },
  approvalGateResult(decision: "approved" | "blocked" | "pending", trace?: TraceContext) {
    write("info", "approval", `Approval gate: ${decision}`, withTrace(trace, { decision }));
  },
  meetingCreated(id: string, requester: string, trace?: TraceContext) {
    write("info", "approval", "Meeting request created", withTrace(trace, { id, requester }));
  },
  meetingApproved(id: string, requester: string, trace?: TraceContext) {
    write("info", "approval", "Meeting approved", withTrace(trace, { id, requester }));
  },
  meetingRejected(id: string, requester: string, trace?: TraceContext) {
    write("info", "approval", "Meeting rejected", withTrace(trace, { id, requester }));
  },

  // --- API retry ---
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
