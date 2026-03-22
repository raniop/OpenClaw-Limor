/**
 * Smart multi-model router.
 * Picks the right model per message based on sender, context, and intent.
 *
 * Rules:
 *  1. Owner + complex request (multi_step_request, action_request with tools, capability) → Opus
 *  2. Owner + simple chat (greeting, question, continuation, etc.)                        → Sonnet
 *  3. Non-owner contacts                                                                  → Sonnet
 *  4. Groups                                                                              → Sonnet
 */

const OPUS  = "claude-opus-4-6";
const SONNET = "claude-sonnet-4-20250514";

/** Intent categories that count as "complex" for owner routing. */
const COMPLEX_INTENTS = new Set([
  "multi_step_request",
  "action_request",
  "reminder_request",
]);

/** Tool-intent types that signal a complex tooling request (used with action_request). */
const TOOL_HEAVY_TYPES = new Set([
  "calendar",
  "booking",
  "travel",
  "crm",
  "messaging",
  "file",
  "capability",
  "whatsapp_management",
]);

export interface ModelSelection {
  model: string;
  reason: string;
}

export interface ModelRouterParams {
  isOwner: boolean;
  isGroup: boolean;
  turnIntent: string;   // TurnIntentCategory
  toolIntentType: string; // ToolIntentType
}

export function selectModel(params: ModelRouterParams): ModelSelection {
  const { isOwner, isGroup, turnIntent, toolIntentType } = params;

  // Rule 4: Groups always use Sonnet
  if (isGroup) {
    return { model: SONNET, reason: "group" };
  }

  // Rule 3: Non-owner contacts always use Sonnet
  if (!isOwner) {
    return { model: SONNET, reason: "non-owner" };
  }

  // --- Owner from here ---

  // Cost optimization: use Sonnet for everything.
  // Opus only for capability requests (rare, needs deep reasoning).
  if (toolIntentType === "capability") {
    return { model: OPUS, reason: "owner + capability" };
  }

  return { model: SONNET, reason: `owner (${turnIntent})` };
}
