/**
 * Relationship memory type definitions.
 */

export type RelationshipType =
  | "unknown"
  | "client"
  | "lead"
  | "friend"
  | "family"
  | "work"
  | "service";

export type CommunicationStyle =
  | "unknown"
  | "formal"
  | "friendly"
  | "brief"
  | "warm";

export interface RelationshipProfile {
  chatId: string;
  name: string;

  relationshipType: RelationshipType;
  importanceScore: number; // 1–100
  communicationStyle: CommunicationStyle;

  notes: string[];

  lastInteractionAt?: string;
  interactionCount: number;

  createdAt: string;
  updatedAt: string;
}
