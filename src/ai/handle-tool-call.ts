/**
 * Unified tool call dispatcher.
 * Uses centralized permission service for access control.
 * Logs tool calls to audit log.
 */
import { allHandlers } from "./handlers";
import { canUseTool, getPermissionDeniedMessage } from "../permissions/permission-service";
import { logAudit } from "../audit/audit-log";
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
    return await handler(input, sender);
  } catch (error: any) {
    return `שגיאה: ${error.message}`;
  }
}
