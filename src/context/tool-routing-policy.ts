/**
 * Tool Routing Policy — deterministic per-turn tool exposure.
 * Narrows the tools sent to Claude based on the resolved context.
 * Instead of all-or-nothing, only relevant tool groups are exposed.
 * Deterministic rules, no AI calls.
 */
import type { ResolvedContext, ToolRoutingPolicy } from "./context-types";

type RoutingInput = Omit<ResolvedContext, "toolRoutingPolicy" | "compressedPrompt" | "outcomeEvaluation" | "debugTrace" | "followupAutomationDecision" | "domainPolicy">;

/** Real tool names from src/ai/tools/ grouped by function */
const TOOL_GROUPS: Record<string, string[]> = {
  messaging: ["send_message", "notify_owner"],
  calendar: ["create_event", "list_events", "request_meeting", "send_calendar_invite"],
  booking: ["ontopo_search", "tabit_search", "book_tabit", "book_ontopo"],
  travel: ["flight_search", "hotel_search"],
  crm: ["crm_search_policy", "crm_policy_details", "crm_policy_customers", "crm_dashboard", "crm_top_policies", "crm_agents_report", "crm_send_sms"],
  file: ["list_files", "read_file", "save_file"],
  contact_lookup: ["add_contact", "delete_contact", "list_contacts", "block_contact", "get_contact_history", "get_group_history", "summarize_group_activity", "create_reminder", "read_sms", "search_sms", "check_deliveries", "mark_delivery_received", "list_pending_deliveries"],
  capability: ["create_capability_request", "list_capability_requests", "run_capability"],
  whatsapp_management: ["list_group_members", "search_messages", "edit_message", "delete_message", "check_read_status", "get_contact_info", "list_labels", "add_label", "pin_message", "create_poll", "forward_message", "group_add_member", "group_remove_member", "check_whatsapp_number"],
  owner_safe_readonly: ["list_events", "list_contacts", "get_contact_history", "get_group_history", "list_instructions", "list_capability_requests", "list_files", "get_current_model", "crm_dashboard", "list_labels", "list_group_members", "check_read_status", "check_whatsapp_number", "get_contact_info", "search_messages", "read_sms", "search_sms", "check_deliveries", "mark_delivery_received", "list_pending_deliveries"],
};

/**
 * Resolve which tool group should be exposed for this turn.
 *
 * POLICY: Never restrict tools. All tools are always available.
 * The AI is smart enough to pick the right ones.
 * Restricting tools causes more problems than it solves
 * (AI can't send messages, can't notify owner, can't use tools it needs).
 */
export function resolveToolRoutingPolicy(resolved: RoutingInput): ToolRoutingPolicy {
  const { toolIntent } = resolved;

  // Always expose all tools — never restrict
  const intentType = toolIntent.type;
  const summary = intentType !== "none"
    ? `זוהה כלי ${intentType} — כל הכלים חשופים`
    : "כל הכלים חשופים";

  return {
    group: intentType !== "none" ? (intentType as any) : "none",
    summary,
    reason: "כל הכלים תמיד זמינים — אין חסימות",
    confidence: 0.95,
    allowedToolNames: [], // empty = don't filter (expose all)
  };
}
