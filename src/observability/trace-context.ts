/**
 * Lightweight per-message trace context.
 * Generated once per incoming message, threaded through the entire flow.
 */
import type { TraceContext } from "./types";

let counter = 0;

/**
 * Create a new trace context for an incoming message.
 */
export function createTrace(params: {
  chatId: string;
  contactName: string;
  phone: string;
  isGroup: boolean;
  isOwner: boolean;
}): TraceContext {
  counter++;
  const ts = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, "0");
  return {
    traceId: `t-${ts}-${seq}`,
    chatId: params.chatId,
    contactName: params.contactName,
    phone: params.phone,
    isGroup: params.isGroup,
    isOwner: params.isOwner,
    startedAt: Date.now(),
  };
}

/**
 * Get elapsed milliseconds since the trace started.
 */
export function elapsed(trace: TraceContext): number {
  return Date.now() - trace.startedAt;
}
