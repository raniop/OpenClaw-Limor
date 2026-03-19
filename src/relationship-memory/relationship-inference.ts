/**
 * Deterministic relationship inference engine.
 * Uses simple heuristics — no AI calls.
 */
import type { RelationshipProfile, RelationshipType, CommunicationStyle } from "./relationship-types";

interface InferenceContext {
  isOwner: boolean;
  isGroup: boolean;
  hasMeetingRequest?: boolean;
  isApprovedContact?: boolean;
}

// Relationship type keywords
const CLIENT_KEYWORDS = ["לקוח", "פוליסה", "ביטוח", "הצעה", "פרמיה", "תביעה", "חידוש", "policy", "insurance"];
const LEAD_KEYWORDS = ["מתעניין", "הצעת מחיר", "עניין", "שאלה לגבי", "פגישה"];
const FAMILY_KEYWORDS = ["אמא", "אבא", "אח", "אחות", "משפחה", "סבא", "סבתא", "דוד", "בן", "בת"];
const WORK_KEYWORDS = ["עבודה", "משרד", "פרויקט", "שותף", "עמית", "צוות", "חברה"];
const SERVICE_KEYWORDS = ["תיקון", "שירות", "התקנה", "אספקה", "הזמנה", "משלוח"];

// Communication style indicators
const FORMAL_INDICATORS = ["שלום רב", "בכבוד", "לכבוד", "בברכה", "מר ", "גברת"];
const WARM_INDICATORS = ["❤️", "😍", "🥰", "💕", "אוהב", "אוהבת", "מתגעגע", "!!!"];
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

/**
 * Strong relationship types that should never be downgraded.
 */
const STRONG_TYPES: RelationshipType[] = ["client", "family"];

/**
 * Infer relationship updates from a message.
 * Returns a partial profile with only the fields that should be updated.
 */
export function inferRelationshipUpdate(
  currentProfile: RelationshipProfile | null,
  message: string,
  senderName: string,
  context: InferenceContext
): Partial<RelationshipProfile> {
  const update: Partial<RelationshipProfile> = {};
  const lowerMsg = message.toLowerCase();

  // --- Relationship Type ---
  const newType = inferRelationshipType(lowerMsg, context);
  if (newType !== "unknown") {
    if (!currentProfile || !STRONG_TYPES.includes(currentProfile.relationshipType) || STRONG_TYPES.includes(newType)) {
      update.relationshipType = newType;
    }
  }

  // --- Communication Style ---
  const style = inferCommunicationStyle(message);
  if (style !== "unknown") {
    update.communicationStyle = style;
  }

  // --- Importance Score ---
  const currentType = update.relationshipType || currentProfile?.relationshipType || "unknown";
  const currentCount = (currentProfile?.interactionCount || 0) + 1;
  update.importanceScore = calculateImportanceScore(
    currentType,
    currentCount,
    currentProfile?.lastInteractionAt,
    context
  );

  return update;
}

function inferRelationshipType(lowerMsg: string, context: InferenceContext): RelationshipType {
  // Check for family keywords first (highest priority)
  if (FAMILY_KEYWORDS.some((kw) => lowerMsg.includes(kw))) return "family";

  // Check for client keywords
  if (CLIENT_KEYWORDS.some((kw) => lowerMsg.includes(kw))) return "client";

  // Check for lead signals
  if (context.hasMeetingRequest || LEAD_KEYWORDS.some((kw) => lowerMsg.includes(kw))) return "lead";

  // Check for work keywords
  if (WORK_KEYWORDS.some((kw) => lowerMsg.includes(kw))) return "work";

  // Check for service keywords
  if (SERVICE_KEYWORDS.some((kw) => lowerMsg.includes(kw))) return "service";

  return "unknown";
}

function inferCommunicationStyle(message: string): CommunicationStyle {
  const lowerMsg = message.toLowerCase();

  // Check formal indicators
  if (FORMAL_INDICATORS.some((ind) => lowerMsg.includes(ind))) return "formal";

  // Check warm indicators
  if (WARM_INDICATORS.some((ind) => message.includes(ind))) return "warm";

  // Count emojis
  const emojiCount = (message.match(EMOJI_REGEX) || []).length;

  // Brief: very short messages
  if (message.length < 20 && emojiCount === 0) return "brief";

  // Friendly: casual with some emojis or casual words
  if (emojiCount >= 1 || /😊|😁|😂|🙂|👍|🤗/.test(message)) return "friendly";

  return "unknown";
}

export function calculateImportanceScore(
  relationshipType: RelationshipType,
  interactionCount: number,
  lastInteractionAt: string | undefined,
  context: InferenceContext
): number {
  let score = 20; // base

  // Role-based minimums
  if (relationshipType === "family") score = Math.max(score, 80);
  if (relationshipType === "client") score = Math.max(score, 70);
  if (relationshipType === "lead") score = Math.max(score, 50);
  if (relationshipType === "work") score = Math.max(score, 50);
  if (relationshipType === "friend") score = Math.max(score, 40);

  // Context boosts
  if (context.isApprovedContact) score += 20;
  if (context.hasMeetingRequest) score += 15;
  if (interactionCount > 10) score += 10;

  // Recency boost
  if (lastInteractionAt) {
    const hoursSince = (Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) score += 10;

    // Decay for inactivity (30+ days)
    const daysSince = hoursSince / 24;
    if (daysSince > 30) score -= 10;
  }

  // Clamp
  return Math.max(1, Math.min(100, score));
}
