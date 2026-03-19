/**
 * Capability learning system types.
 */

export type TeachingLevel = "fact" | "instruction" | "capability";

export interface CapabilitySpec {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  createdAt: string;
  problem: string;
  whyCurrentSystemCantDoIt: string;
  proposedSolution: string;
  affectedModules: string[];
  requiredTools: string[];
  risks: string[];
  validationPlan: string;
  level: "prompt_only" | "retrieval" | "tool_addition" | "code_change" | "integration";
}

export interface ClassificationResult {
  level: TeachingLevel;
  confidence: "high" | "medium" | "low";
  reason: string;
}
