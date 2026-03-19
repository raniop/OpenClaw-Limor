/**
 * Replay Runner — Phase 14: deterministic scenario simulator.
 * Replays messages through the full brain pipeline without WhatsApp or AI calls.
 * Useful for testing, debugging, and building scenario libraries.
 */
import type { ResolvedContext } from "./context-types";
import { buildResolvedContext } from "./context-builder";

export interface ReplayTurnInput {
  chatId: string;
  message: string;
  sender: {
    name: string;
    isOwner: boolean;
    isGroup: boolean;
  };
}

export interface ReplayTurnResult {
  input: ReplayTurnInput;
  resolved: ResolvedContext;
}

export interface ReplayScenario {
  name: string;
  turns: ReplayTurnInput[];
}

export interface ReplayScenarioResult {
  name: string;
  turns: ReplayTurnResult[];
  summary: string;
}

/**
 * Run a single turn through the full brain pipeline.
 * Returns the input paired with the full resolved context.
 */
export function runReplayTurn(input: ReplayTurnInput): ReplayTurnResult {
  const resolved = buildResolvedContext({
    chatId: input.chatId,
    message: input.message,
    sender: input.sender,
  });
  return { input, resolved };
}

/**
 * Run a full scenario (multiple turns) sequentially through the brain.
 * Returns all turn results plus a Hebrew summary.
 */
export function runReplayScenario(scenario: ReplayScenario): ReplayScenarioResult {
  const turns: ReplayTurnResult[] = [];
  for (const turn of scenario.turns) {
    turns.push(runReplayTurn(turn));
  }
  const summary = buildScenarioSummary(scenario.name, turns);
  return { name: scenario.name, turns, summary };
}

function buildScenarioSummary(name: string, turns: ReplayTurnResult[]): string {
  const count = turns.length;
  const hasClarify = turns.some(
    (t) =>
      t.resolved.executionDecision.type === "clarify_before_execution" ||
      t.resolved.actionPlan.needsClarification
  );
  const hasToolExecution = turns.some(
    (t) => t.resolved.executionDecision.type === "allow_tool_execution"
  );

  const parts: string[] = [];
  parts.push(`הורץ תרחיש "${name}" עם ${count} תורות`);

  if (hasClarify) parts.push("כולל בקשת הבהרה");
  if (hasToolExecution) parts.push("כולל הפעלת כלים");

  return parts.join(", ") + ".";
}
