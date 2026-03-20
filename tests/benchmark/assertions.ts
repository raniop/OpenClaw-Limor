/**
 * Benchmark assertion helpers for replay scenario validation.
 * Uses Node's built-in assert module.
 */
import assert from "node:assert/strict";
import type {
  ReplayTurnResult,
  TurnIntentCategory,
  ToolIntentType,
  MissingDetailType,
  UserMood,
  OutcomeStatus,
  ConversationStateType,
  ResponseStrategyType,
} from "../../src/context/context-types";

// ---- Turn Intent ----

export function assertTurnIntent(result: ReplayTurnResult, expected: TurnIntentCategory): void {
  assert.strictEqual(
    result.resolved.bundle.turnIntent.category,
    expected,
    `Expected turnIntent "${expected}", got "${result.resolved.bundle.turnIntent.category}" for message: "${result.input.message}"`
  );
}

export function assertTurnIntentOneOf(result: ReplayTurnResult, expected: TurnIntentCategory[]): void {
  const actual = result.resolved.bundle.turnIntent.category;
  assert.ok(
    expected.includes(actual),
    `Expected turnIntent to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Primary Focus ----

export function assertPrimaryFocus(result: ReplayTurnResult, expected: string): void {
  assert.strictEqual(
    result.resolved.primaryFocus.type,
    expected,
    `Expected primaryFocus "${expected}", got "${result.resolved.primaryFocus.type}" for message: "${result.input.message}"`
  );
}

export function assertPrimaryFocusOneOf(result: ReplayTurnResult, expected: string[]): void {
  const actual = result.resolved.primaryFocus.type;
  assert.ok(
    expected.includes(actual),
    `Expected primaryFocus to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Tool Intent ----

export function assertToolIntent(result: ReplayTurnResult, expected: ToolIntentType): void {
  assert.strictEqual(
    result.resolved.toolIntent.type,
    expected,
    `Expected toolIntentType "${expected}", got "${result.resolved.toolIntent.type}" for message: "${result.input.message}"`
  );
}

export function assertShouldUseTool(result: ReplayTurnResult, expected: boolean): void {
  assert.strictEqual(
    result.resolved.toolIntent.shouldUseTool,
    expected,
    `Expected shouldUseTool=${expected}, got ${result.resolved.toolIntent.shouldUseTool} for message: "${result.input.message}"`
  );
}

// ---- Clarification ----

export function assertNeedsClarification(result: ReplayTurnResult, expected: boolean): void {
  assert.strictEqual(
    result.resolved.actionPlan.needsClarification,
    expected,
    `Expected needsClarification=${expected}, got ${result.resolved.actionPlan.needsClarification} for message: "${result.input.message}"`
  );
}

export function assertNoClarification(result: ReplayTurnResult): void {
  assertNeedsClarification(result, false);
}

// ---- Contradictions ----

export function assertHasContradictions(result: ReplayTurnResult): void {
  const hasReal = result.resolved.contradictions.some((c) => c.type !== "none");
  assert.ok(
    hasReal,
    `Expected contradictions to be detected for message: "${result.input.message}"`
  );
}

export function assertNoContradictions(result: ReplayTurnResult): void {
  const hasReal = result.resolved.contradictions.some((c) => c.type !== "none");
  assert.ok(
    !hasReal,
    `Expected no contradictions, but found some for message: "${result.input.message}": ${JSON.stringify(result.resolved.contradictions)}`
  );
}

// ---- Missing Info ----

export function assertMissingInfo(result: ReplayTurnResult, expected: MissingDetailType[]): void {
  const actual = result.resolved.bundle.missingInfo.missing;
  for (const item of expected) {
    assert.ok(
      actual.includes(item),
      `Expected missingInfo to include "${item}", got [${actual.join(", ")}] for message: "${result.input.message}"`
    );
  }
}

export function assertNoMissingInfo(result: ReplayTurnResult): void {
  const actual = result.resolved.bundle.missingInfo.missing;
  const filtered = actual.filter((m) => m !== "none");
  assert.strictEqual(
    filtered.length,
    0,
    `Expected no missing info, got [${actual.join(", ")}] for message: "${result.input.message}"`
  );
}

// ---- Mood ----

export function assertMood(result: ReplayTurnResult, expected: UserMood): void {
  assert.strictEqual(
    result.resolved.bundle.mood.mood,
    expected,
    `Expected mood "${expected}", got "${result.resolved.bundle.mood.mood}" for message: "${result.input.message}"`
  );
}

export function assertMoodOneOf(result: ReplayTurnResult, expected: UserMood[]): void {
  const actual = result.resolved.bundle.mood.mood;
  assert.ok(
    expected.includes(actual),
    `Expected mood to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Outcome ----

export function assertOutcome(result: ReplayTurnResult, expected: OutcomeStatus): void {
  assert.strictEqual(
    result.resolved.outcomeEvaluation.status,
    expected,
    `Expected outcome "${expected}", got "${result.resolved.outcomeEvaluation.status}" for message: "${result.input.message}"`
  );
}

export function assertOutcomeOneOf(result: ReplayTurnResult, expected: OutcomeStatus[]): void {
  const actual = result.resolved.outcomeEvaluation.status;
  assert.ok(
    expected.includes(actual),
    `Expected outcome to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Conversation State ----

export function assertConversationState(result: ReplayTurnResult, expected: ConversationStateType): void {
  assert.strictEqual(
    result.resolved.conversationState.type,
    expected,
    `Expected conversationState "${expected}", got "${result.resolved.conversationState.type}" for message: "${result.input.message}"`
  );
}

export function assertConversationStateOneOf(result: ReplayTurnResult, expected: ConversationStateType[]): void {
  const actual = result.resolved.conversationState.type;
  assert.ok(
    expected.includes(actual),
    `Expected conversationState to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Response Strategy ----

export function assertResponseStrategy(result: ReplayTurnResult, expected: ResponseStrategyType): void {
  assert.strictEqual(
    result.resolved.responseStrategy.type,
    expected,
    `Expected responseStrategy "${expected}", got "${result.resolved.responseStrategy.type}" for message: "${result.input.message}"`
  );
}

export function assertResponseStrategyOneOf(result: ReplayTurnResult, expected: ResponseStrategyType[]): void {
  const actual = result.resolved.responseStrategy.type;
  assert.ok(
    expected.includes(actual),
    `Expected responseStrategy to be one of [${expected.join(", ")}], got "${actual}" for message: "${result.input.message}"`
  );
}

// ---- Response Mode ----

export function assertBrevity(result: ReplayTurnResult, expected: "short" | "medium"): void {
  assert.strictEqual(
    result.resolved.responseMode.brevity,
    expected,
    `Expected brevity "${expected}", got "${result.resolved.responseMode.brevity}" for message: "${result.input.message}"`
  );
}

export function assertShouldMentionOpenLoops(result: ReplayTurnResult, expected: boolean): void {
  assert.strictEqual(
    result.resolved.responseMode.shouldMentionOpenLoops,
    expected,
    `Expected shouldMentionOpenLoops=${expected}, got ${result.resolved.responseMode.shouldMentionOpenLoops} for message: "${result.input.message}"`
  );
}

// ---- Mentioned Entities ----

export function assertMentionedEntities(result: ReplayTurnResult, expected: string[]): void {
  const actual = result.resolved.bundle.turnIntent.mentionedEntities;
  for (const entity of expected) {
    assert.ok(
      actual.includes(entity),
      `Expected mentionedEntities to include "${entity}", got [${actual.join(", ")}] for message: "${result.input.message}"`
    );
  }
}
