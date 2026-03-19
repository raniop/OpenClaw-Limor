export type { RelationshipProfile, RelationshipType, CommunicationStyle } from "./relationship-types";
export { getProfile, upsertProfile, updateProfile, listProfiles, deleteProfile } from "./relationship-store";
export { inferRelationshipUpdate, calculateImportanceScore } from "./relationship-inference";
export { updateFromMessage, getProfileSummary, getAllProfiles, enrichContextForAI } from "./relationship-service";
