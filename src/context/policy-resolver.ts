/**
 * Policy Precedence Resolver — organizes all loaded context by explicit priority levels.
 *
 * Policy precedence levels (highest to lowest):
 * 1. Hard safety / system rules (OPERATING_PRINCIPLES.md iron rules)
 * 2. Owner instructions (instructions.json — taught by owner)
 * 3. Workspace identity (SOUL.md, VOICE.md)
 * 4. Workspace policies (policies/*.md — conditional)
 * 5. Runbooks (runbooks/*.md — situational)
 * 6. User-specific preferences (memory per user)
 * 7. Recent conversation context (history)
 */

import { getBasePrompt, getRelevantContext } from "../workspace-loader";
import { getInstructionsContext } from "../instructions";

export interface PolicySource {
  level: number;
  name: string;
  source: string;  // file path or "runtime"
  content: string;
  reason: string;  // why it was loaded
}

export interface ResolvedPolicies {
  sources: PolicySource[];
  /** Combined context string in precedence order, ready for prompt injection */
  combined: string;
  summary: string;  // one-line description of what was loaded
}

/**
 * Resolve all policies in precedence order, combining workspace identity,
 * owner instructions, workspace policies/runbooks, and runtime context.
 *
 * Returns a structured list of sources with their precedence levels,
 * plus a combined string for direct prompt injection.
 */
export function resolvePolicies(params: {
  message: string;
  isOwner: boolean;
  isGroup: boolean;
  memoryContext: string;
  instructions: string;
}): ResolvedPolicies {
  const { message, isOwner, isGroup, memoryContext, instructions } = params;
  const sources: PolicySource[] = [];

  // Level 1 + 3: Base prompt contains OPERATING_PRINCIPLES (level 1) + SOUL/VOICE (level 3)
  // They come from getBasePrompt() as a single block — we tag them together
  const basePrompt = getBasePrompt();
  if (basePrompt) {
    sources.push({
      level: 1,
      name: "identity + safety rules",
      source: "workspace/identity/*.md",
      content: basePrompt,
      reason: "Always loaded — core identity and iron rules",
    });
  }

  // Level 2: Owner instructions (instructions.json — taught by owner at runtime)
  const instructionsCtx = instructions || getInstructionsContext();
  if (instructionsCtx) {
    sources.push({
      level: 2,
      name: "owner instructions",
      source: "state/instructions.json",
      content: instructionsCtx,
      reason: "Owner-defined rules that override defaults",
    });
  }

  // Level 4 + 5: Workspace policies and runbooks (conditional on message keywords)
  const relevantContext = getRelevantContext(message, isGroup, isOwner);
  if (relevantContext) {
    sources.push({
      level: 4,
      name: "workspace policies + runbooks",
      source: "workspace/policies/*.md, workspace/runbooks/*.md",
      content: relevantContext,
      reason: `Keyword-matched from message`,
    });
  }

  // Level 6: User-specific memory context
  if (memoryContext) {
    sources.push({
      level: 6,
      name: "user memory",
      source: "runtime",
      content: memoryContext,
      reason: "Per-user facts, preferences, and relationship data",
    });
  }

  // Sort by precedence level (lowest number = highest priority)
  sources.sort((a, b) => a.level - b.level);

  // Build combined string in precedence order
  const combined = sources
    .map((s) => s.content)
    .filter(Boolean)
    .join("\n\n");

  // Build summary
  const loadedNames = sources.map((s) => `L${s.level}:${s.name}`);
  const summary = `Policy resolution: ${sources.length} sources loaded [${loadedNames.join(", ")}]`;

  console.log(`[policy-resolver] ${summary}`);

  return { sources, combined, summary };
}
