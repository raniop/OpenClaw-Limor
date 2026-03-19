/**
 * Types for the explainability / decision tracking system.
 */

export type DecisionCategory =
  | "approval"
  | "meeting"
  | "tool"
  | "group"
  | "digest"
  | "capability"
  | "followup"
  | "memory";

export interface DecisionRecord {
  id: string;
  timestamp: string;
  actor: string;
  category: DecisionCategory;
  summary: string;
  inputContext: string[];
  rulesApplied: string[];
  toolsUsed: string[];
  outcome: string;
  confidence?: number;
  target?: string;
}
