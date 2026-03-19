/**
 * Relationship memory service — high-level API for managing relationship profiles.
 */
import type { RelationshipProfile, RelationshipType, CommunicationStyle } from "./relationship-types";
import { getProfile, upsertProfile, updateProfile, listProfiles } from "./relationship-store";
import { inferRelationshipUpdate } from "./relationship-inference";

interface MessageContext {
  isOwner: boolean;
  isGroup: boolean;
  hasMeetingRequest?: boolean;
  isApprovedContact?: boolean;
}

/**
 * Update relationship profile based on a new message.
 * Creates profile if it doesn't exist.
 */
export function updateFromMessage(
  chatId: string,
  name: string,
  message: string,
  context: MessageContext
): RelationshipProfile {
  let profile = getProfile(chatId);
  const now = new Date().toISOString();

  if (!profile) {
    profile = {
      chatId,
      name,
      relationshipType: "unknown",
      importanceScore: 20,
      communicationStyle: "unknown",
      notes: [],
      lastInteractionAt: now,
      interactionCount: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Run inference
  const updates = inferRelationshipUpdate(profile, message, name, context);

  // Apply updates
  const updated: RelationshipProfile = {
    ...profile,
    ...updates,
    name: name || profile.name,
    lastInteractionAt: now,
    interactionCount: profile.interactionCount + 1,
    updatedAt: now,
  };

  upsertProfile(updated);
  return updated;
}

const TYPE_NAMES: Record<RelationshipType, string> = {
  unknown: "לא מוגדר",
  client: "לקוח",
  lead: "ליד",
  friend: "חבר/ה",
  family: "משפחה",
  work: "עבודה",
  service: "שירות",
};

const STYLE_NAMES: Record<CommunicationStyle, string> = {
  unknown: "לא מוגדר",
  formal: "פורמלי",
  friendly: "חברותי",
  brief: "תמציתי",
  warm: "חם",
};

/**
 * Get a Hebrew summary of a contact's relationship profile.
 */
export function getProfileSummary(chatId: string): string {
  const profile = getProfile(chatId);
  if (!profile) {
    return "אין מידע על איש קשר זה.";
  }

  const lastDate = profile.lastInteractionAt
    ? new Date(profile.lastInteractionAt).toLocaleDateString("he-IL")
    : "לא ידוע";

  return [
    `👤 *פרופיל: ${profile.name}*`,
    `  - סוג קשר: ${TYPE_NAMES[profile.relationshipType]}`,
    `  - חשיבות: ${profile.importanceScore}/100`,
    `  - סגנון תקשורת: ${STYLE_NAMES[profile.communicationStyle]}`,
    `  - אינטראקציות: ${profile.interactionCount}`,
    `  - עדכון אחרון: ${lastDate}`,
    profile.notes.length > 0 ? `  - הערות: ${profile.notes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Get all profiles.
 */
export function getAllProfiles(): RelationshipProfile[] {
  return listProfiles();
}

/**
 * Enrich AI context with relationship info.
 * Returns short text for injection into system prompt.
 */
export function enrichContextForAI(chatId: string): string {
  const profile = getProfile(chatId);
  if (!profile || profile.relationshipType === "unknown") {
    return "";
  }

  const parts: string[] = [];
  parts.push(`הקשר עם ${profile.name}: ${TYPE_NAMES[profile.relationshipType]}`);
  parts.push(`חשוב (${profile.importanceScore}/100)`);
  if (profile.communicationStyle !== "unknown") {
    parts.push(`סגנון ${STYLE_NAMES[profile.communicationStyle]}`);
  }

  return parts.join(", ") + ".";
}
