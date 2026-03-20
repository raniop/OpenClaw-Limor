/**
 * Response Mode Resolver — determines how Limor should respond.
 * Adapts tone, brevity, structure, and meta-behaviors based on context.
 * Deterministic rules, no AI calls.
 */
import type { ContextBundle, PrimaryFocus, ResponseMode } from "./context-types";

/**
 * Resolve the response mode based on the context bundle and primary focus.
 */
function resolveRegister(): ResponseMode["register"] {
  const now = new Date();
  const hour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" })
  );
  const day = now.getDay(); // 0=Sunday, 6=Saturday

  // Weekend (Friday evening to Saturday night in Israel = day 5 after 14:00, day 6)
  if (day === 6 || (day === 5 && hour >= 14)) return "relaxed";
  // Late night
  if (hour >= 22 || hour < 7) return "casual";
  // Business hours
  if (hour >= 8 && hour < 18) return "professional";
  // Evening
  return "casual";
}

export function resolveResponseMode(bundle: ContextBundle, focus: PrimaryFocus): ResponseMode {
  // Defaults
  let tone: ResponseMode["tone"] = "professional";
  let brevity: ResponseMode["brevity"] = "medium";
  let structure: ResponseMode["structure"] = "direct_answer";
  let register = resolveRegister();
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

  // --- Mood-aware adaptation ---
  const { mood } = bundle.mood;
  if (mood === "stressed" || mood === "rushed") {
    tone = "direct";
    brevity = "short";
  }
  if (mood === "frustrated") {
    tone = "warm";
    brevity = "short";
  }
  if (mood === "happy" || mood === "excited") {
    tone = "friendly";
  }
  if (mood === "sad") {
    tone = "warm";
  }

  // --- Communication style adaptation (only if tone is still default) ---
  if (tone === "professional" && bundle.person.communicationStyle === "friendly") {
    tone = "friendly";
  }
  if (tone === "professional" && bundle.person.communicationStyle === "warm") {
    tone = "warm";
  }

  return { tone, brevity, structure, register, shouldAcknowledgeDelay, shouldMentionOpenLoops };
}
