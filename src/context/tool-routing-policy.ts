/**
 * Tool Routing Policy — deterministic per-turn tool exposure.
 * Narrows the tools sent to Claude based on the resolved context.
 * Instead of all-or-nothing, only relevant tool groups are exposed.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, ToolRoutingPolicy } from "./context-types";

type RoutingInput = Omit<ResolvedContext, "toolRoutingPolicy" | "compressedPrompt" | "outcomeEvaluation">;

/** Real tool names from src/ai/tools/ grouped by function */
const TOOL_GROUPS: Record<string, string[]> = {
  messaging: ["send_message", "notify_owner"],
  calendar: ["create_event", "list_events", "request_meeting", "send_calendar_invite"],
  booking: ["ontopo_search", "tabit_search", "book_tabit", "book_ontopo"],
  travel: ["flight_search", "hotel_search"],
  crm: ["crm_search_policy", "crm_policy_details", "crm_policy_customers", "crm_dashboard", "crm_top_policies", "crm_agents_report", "crm_send_sms"],
  file: ["list_files", "read_file", "save_file"],
  contact_lookup: ["add_contact", "list_contacts", "get_contact_history", "get_group_history", "summarize_group_activity", "create_reminder"],
  capability: ["create_capability_request", "list_capability_requests", "run_capability"],
  owner_safe_readonly: ["list_events", "list_contacts", "get_contact_history", "get_group_history", "list_instructions", "list_capability_requests", "list_files", "get_current_model", "crm_dashboard"],
};

/**
 * Resolve which tool group should be exposed for this turn.
 * Priority-ordered rules — first match wins.
 */
export function resolveToolRoutingPolicy(resolved: RoutingInput): ToolRoutingPolicy {
  const { executionDecision, responseStrategy, primaryFocus, toolIntent } = resolved;

  // 1. Tools blocked entirely — expose nothing
  if (!executionDecision.allowTools) {
    return {
      group: "none",
      summary: "לא לחשוף כלים",
      reason: executionDecision.reason,
      confidence: 0.8,
      allowedToolNames: [],
    };
  }

  // 2. Status/summary mode — readonly tools only
  if (responseStrategy.type === "owner_summary" || primaryFocus.type === "status") {
    return {
      group: "owner_safe_readonly",
      summary: "לחשוף רק כלים בטוחים לקריאה",
      reason: "מדובר בסטטוס/סיכום ולא בביצוע ישיר",
      confidence: 0.85,
      allowedToolNames: TOOL_GROUPS.owner_safe_readonly,
    };
  }

  // 3-10. Route by tool intent type
  const intentType = toolIntent.type;
  if (intentType !== "none" && intentType in TOOL_GROUPS) {
    return {
      group: intentType as any,
      summary: `לחשוף כלי ${intentType}`,
      reason: toolIntent.reason,
      confidence: 0.92,
      allowedToolNames: TOOL_GROUPS[intentType],
    };
  }

  // Default: tools are allowed but no specific routing — expose all
  // (This preserves backward compatibility when allowTools=true but no intent detected)
  return {
    group: "none",
    summary: "לא זוהה כלי ספציפי — כל הכלים חשופים",
    reason: "אין מיקוד ברור לסוג כלי מסוים",
    confidence: 0.6,
    allowedToolNames: [], // empty = don't filter (expose all)
  };
}
