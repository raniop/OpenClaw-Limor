/**
 * Centralized permission service.
 * Defines roles and maps tools to allowed roles.
 * Replaces scattered `if (!sender?.isOwner)` checks.
 */
import type { SenderContext } from "../ai/types";

export type Role = "owner" | "approved_contact" | "group" | "unknown";

export function getRole(sender?: SenderContext): Role {
  if (!sender) return "unknown";
  if (sender.isOwner) return "owner";
  if (sender.chatId.endsWith("@g.us")) return "group";
  return "approved_contact";
}

/**
 * Tool permission map.
 * Each tool name (or prefix) maps to the roles that can use it.
 * Tools not listed here are available to all roles.
 */
const TOOL_PERMISSIONS: Record<string, Role[]> = {
  // Messaging
  send_message: ["owner"],
  mute_group: ["owner"],
  unmute_group: ["owner"],

  // CRM (prefix-matched)
  "crm_": ["owner"],

  // Contact management
  add_contact: ["owner"],
  list_contacts: ["owner"],
  delete_contact: ["owner"],
  block_contact: ["owner"],
  get_contact_history: ["owner"],
  get_group_history: ["owner"],

  // File operations
  list_files: ["owner"],
  read_file: ["owner"],
  save_file: ["owner"],

  // Instructions
  learn_instruction: ["owner"],
  forget_instruction: ["owner"],
  list_instructions: ["owner"],

  // Smart home
  smart_home_control: ["owner"],
  smart_home_status: ["owner"],
  smart_home_list: ["owner"],

  // Model switching
  switch_model: ["owner"],
  get_current_model: ["owner"],

  // Capabilities
  create_capability_request: ["owner"],
  list_capability_requests: ["owner"],
  run_capability: ["owner"],

  // Coding / self-programming
  code_start_session: ["owner"],
  code_read: ["owner"],
  code_write: ["owner"],
  code_execute: ["owner"],
  code_build_test: ["owner"],
  code_show_diff: ["owner"],
  code_apply: ["owner"],
  code_cleanup: ["owner"],
  code_implement: ["owner"],

  // Gett taxi
  gett_book_ride: ["owner"],
  gett_ride_status: ["owner"],
  gett_cancel_ride: ["owner"],

  // Group summary
  summarize_group_activity: ["owner"],

  // WhatsApp extras
  list_group_members: ["owner"],
  search_messages: ["owner"],
  edit_message: ["owner"],
  delete_message: ["owner"],
  check_read_status: ["owner"],
  get_contact_info: ["owner"],
  list_labels: ["owner"],
  add_label: ["owner"],
  pin_message: ["owner"],
  create_poll: ["owner"],
  forward_message: ["owner"],
  group_add_member: ["owner"],
  group_remove_member: ["owner"],
  check_whatsapp_number: ["owner"],
};

// Tools available to approved contacts (in addition to universal tools)
const APPROVED_CONTACT_TOOLS = new Set([
  "request_meeting",
  "notify_owner",
  "create_event",
  "list_events",
  "send_calendar_invite",
]);

/**
 * Check if a sender can use a specific tool.
 * Owner can use all tools. Others checked against permission map.
 */
export function canUseTool(toolName: string, sender?: SenderContext): boolean {
  const role = getRole(sender);

  // Owner can use everything
  if (role === "owner") return true;

  // Check for prefix-matched permissions (e.g., "crm_" matches "crm_search_policy")
  for (const [key, roles] of Object.entries(TOOL_PERMISSIONS)) {
    if (key.endsWith("_") && toolName.startsWith(key)) {
      return roles.includes(role);
    }
    if (toolName === key) {
      return roles.includes(role);
    }
  }

  // Universal tools (calendar, travel, booking) — available to all
  return true;
}

/**
 * Get a Hebrew permission-denied message for a tool.
 */
export function getPermissionDeniedMessage(toolName: string): string {
  return "אין לך הרשאה לפעולה זו. רק רני יכול לבצע פעולה זו.";
}
