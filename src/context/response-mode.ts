/**
 * Response Mode Resolver — determines how Limor should respond.
 * Adapts tone, brevity, structure, and meta-behaviors based on context.
 * Deterministic rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode } from "./context-types";

/**
 * Resolve the response mode based on the context bundle and primary focus.
 */
export function resolveResponseMode(bundle: ContextBundle, focus: PrimaryFocus): ResponseMode {
  // Defaults
  let tone: ResponseMode["tone"] = "professional";
  let brevity: ResponseMode["brevity"] = "medium";
  let structure: ResponseMode["structure"] = "direct_answer";
  let shouldAcknowledgeDelay = false;
  let shouldMentionOpenLoops = false;

  // --- Structure rules ---
  if (focus.type === "status") {
    structure = "status_list";
  }
  if (bundle.turnIntent.category === "correction") {
    structure = "action_confirmation";
  }

  // --- Tone and brevity rules ---
  if (bundle.conversation.repeatedRecentMessages) {
    tone = "direct";
    brevity = "short";
  }
  if (bundle.urgency.isOverdue) {
    tone = "direct";
  }
  if (bundle.turnIntent.category === "greeting" && bundle.urgency.priority === "low") {
    tone = "friendly";
  }

  // --- Open loops mention ---
  if (bundle.person.isOwner && (focus.type === "followup" || focus.type === "status" || focus.type === "meeting")) {
    shouldMentionOpenLoops = true;
  }
  if (focus.type === "followup" || focus.type === "status" || focus.type === "meeting") {
    shouldMentionOpenLoops = true;
  }

  // --- Delay acknowledgment ---
  if (bundle.urgency.waitingTimeMinutes > 60 || bundle.conversation.repeatedRecentMessages) {
    shouldAcknowledgeDelay = true;
  }

  // --- Communication style adaptation (only if tone is still default) ---
  if (tone === "professional" && bundle.person.communicationStyle === "friendly") {
    tone = "friendly";
  }
  if (tone === "professional" && bundle.person.communicationStyle === "warm") {
    tone = "warm";
  }

  return { tone, brevity, structure, shouldAcknowledgeDelay, shouldMentionOpenLoops };
}
