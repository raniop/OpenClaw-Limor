/**
 * Centralized permission service.
 * Defines roles and maps tools to allowed roles.
 * Replaces scattered `if (!sender?.isOwner)` checks.
 */
import type { SenderContext } from "../ai/types";
import { config } from "../config";
import { getDb } from "../stores/sqlite-init";

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
  // Calendar — owner-only
  create_event: ["owner"],
  delete_event: ["owner"],
  list_events: ["owner"],

  // Messaging
  send_message: ["owner"],
  mute_group: ["owner"],
  unmute_group: ["owner"],

  // CRM (prefix-matched)
  "crm_": ["owner"],

  // Contact management
  grant_tool_access: ["owner"],
  revoke_tool_access: ["owner"],
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
// Note: create_event is NOT here — contacts must use request_meeting instead.
// The handler also enforces this, but belt-and-suspenders.
const APPROVED_CONTACT_TOOLS = new Set([
  "request_meeting",
  "notify_owner",
  "send_calendar_invite",
]);

// ─── Per-contact tool grants ────────────────────────────────────────────────

/**
 * Check if a contact has a per-contact grant for a specific tool.
 * Supports exact matches ("list_events") and prefix matches ("crm_").
 */
function hasContactGrant(chatId: string, toolName: string): boolean {
  try {
    const db = getDb();
    const grants = db
      .prepare("SELECT tool_pattern FROM contact_tool_permissions WHERE chat_id = ?")
      .all(chatId) as Array<{ tool_pattern: string }>;

    for (const { tool_pattern } of grants) {
      // Prefix match: "crm_" matches "crm_search_policy"
      if (tool_pattern.endsWith("_") && toolName.startsWith(tool_pattern)) return true;
      // Exact match
      if (tool_pattern === toolName) return true;
    }
  } catch (err) {
    console.error("[permissions] Failed to check contact grants:", err);
  }
  return false;
}

/**
 * Grant tool access patterns to a contact.
 */
export function grantContactTools(chatId: string, patterns: string[]): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO contact_tool_permissions (chat_id, tool_pattern) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    for (const pattern of patterns) {
      stmt.run(chatId, pattern);
    }
  });
  tx();
}

/**
 * Revoke tool access patterns from a contact.
 * If no patterns specified, revokes ALL grants for the contact.
 */
export function revokeContactTools(chatId: string, patterns?: string[]): void {
  const db = getDb();
  if (!patterns || patterns.length === 0) {
    db.prepare("DELETE FROM contact_tool_permissions WHERE chat_id = ?").run(chatId);
  } else {
    const stmt = db.prepare(
      "DELETE FROM contact_tool_permissions WHERE chat_id = ? AND tool_pattern = ?"
    );
    const tx = db.transaction(() => {
      for (const pattern of patterns) {
        stmt.run(chatId, pattern);
      }
    });
    tx();
  }
}

/**
 * List all per-contact tool grants (for admin/debug).
 */
export function listContactGrants(): Array<{ chatId: string; toolPattern: string; createdAt: string }> {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT chat_id, tool_pattern, created_at FROM contact_tool_permissions ORDER BY chat_id")
      .all() as Array<{ chat_id: string; tool_pattern: string; created_at: string }>;
    return rows.map((r) => ({ chatId: r.chat_id, toolPattern: r.tool_pattern, createdAt: r.created_at }));
  } catch {
    return [];
  }
}

/**
 * Get grants for a specific contact.
 */
export function getContactGrants(chatId: string): string[] {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT tool_pattern FROM contact_tool_permissions WHERE chat_id = ?")
      .all(chatId) as Array<{ tool_pattern: string }>;
    return rows.map((r) => r.tool_pattern);
  } catch {
    return [];
  }
}

// ─── Core permission check ──────────────────────────────────────────────────

/**
 * Check if a sender can use a specific tool.
 * Owner can use all tools. Others checked against per-contact grants, then role map.
 */
export function canUseTool(toolName: string, sender?: SenderContext): boolean {
  const role = getRole(sender);

  // Owner can use everything
  if (role === "owner") return true;

  // Per-contact grants override role-based restrictions
  if (sender?.chatId && hasContactGrant(sender.chatId, toolName)) {
    return true;
  }

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
  return `אין לך הרשאה לפעולה זו. רק ${config.ownerName} יכול לבצע פעולה זו.`;
}
