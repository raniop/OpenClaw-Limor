/**
 * Unified tool call dispatcher.
 * Uses centralized permission service for access control.
 * Logs tool calls to audit log.
 */
import { allHandlers } from "./handlers";
import { canUseTool, getPermissionDeniedMessage } from "../permissions/permission-service";
import { logAudit } from "../audit/audit-log";
import { recordToolFailure } from "../context/failure-learner";
import type { SenderContext } from "./types";

export async function handleToolCall(
  name: string,
  input: Record<string, any>,
  sender?: SenderContext
): Promise<string> {
  if (!canUseTool(name, sender)) {
    return getPermissionDeniedMessage(name);
  }

  const actor = sender?.name || "unknown";
  logAudit(actor, "tool_call", name, "started", { input: Object.keys(input) });

  const handler = allHandlers[name];
  if (!handler) return "פעולה לא מוכרת";

  try {
    const result = await handler(input, sender);
    // Record failures that return error indicators (not just thrown exceptions)
    if (result && (result.includes("❌") || result.startsWith("שגיאה:"))) {
      recordToolFailure(name, result.slice(0, 300), input);
    }
    return result;
  } catch (error: any) {
    recordToolFailure(name, error.message, input);
    return `שגיאה: ${error.message}`;
  }
}
