/**
 * Observability types — trace context and structured log payload.
 */

export interface TraceContext {
  traceId: string;
  chatId: string;
  contactName: string;
  phone: string;
  isGroup: boolean;
  isOwner: boolean;
  startedAt: number; // Date.now()
}

export interface LogPayload {
  traceId: string;
  chatId: string;
  event: string;
  durationMs?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
  operation: string;
  traceId: string;
}
