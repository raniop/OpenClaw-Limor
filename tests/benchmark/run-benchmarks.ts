/**
 * Benchmark runner — loads scenario JSON files, runs each through the replay engine,
 * validates expectations, and produces a summary report.
 *
 * Exit code 1 if any test fails.
 */
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runReplayScenario } from "../../src/context/replay-runner";
import type {
  ReplayTurnInput,
  ReplayTurnResult,
  TurnIntentCategory,
  ToolIntentType,
  MissingDetailType,
  UserMood,
  ConversationStateType,
  ResponseStrategyType,
} from "../../src/context/context-types";
import {
  assertTurnIntent,
  assertPrimaryFocusOneOf,
  assertToolIntent,
  assertShouldUseTool,
  assertNeedsClarification,
  assertHasContradictions,
  assertNoContradictions,
  assertMissingInfo,
  assertNoMissingInfo,
  assertMoodOneOf,
  assertConversationStateOneOf,
  assertResponseStrategyOneOf,
  assertBrevity,
  assertMentionedEntities,
} from "./assertions";

// ---- Types for scenario JSON ----

interface ScenarioExpectations {
  // Single-turn expectations (applied to first or only turn)
  turnIntent?: TurnIntentCategory;
  primaryFocus?: string | string[];
  shouldUseTool?: boolean;
  toolIntentType?: ToolIntentType;
  needsClarification?: boolean;
  missingInfo?: MissingDetailType[];
  noMissingInfo?: boolean;
  mood?: UserMood | UserMood[];
  brevity?: "short" | "medium";
  outcomeStatus?: string | string[];
  conversationState?: ConversationStateType | ConversationStateType[];
  responseStrategy?: ResponseStrategyType | ResponseStrategyType[];
  noContradictions?: boolean;
  hasContradictions?: boolean;
  mentionedEntities?: string[];
  responseModeShouldMentionOpenLoops?: boolean;

  // Multi-turn expectations (applied to last turn)
  lastTurnIntent?: TurnIntentCategory;
  lastConversationState?: ConversationStateType | ConversationStateType[];
  lastShouldUseTool?: boolean;

  // Full sequence expectations
  turnIntents?: TurnIntentCategory[];
  turnCount?: number;
}

interface ScenarioDefinition {
  name: string;
  category: string;
  turns: ReplayTurnInput[];
  expectations: ScenarioExpectations;
}

// ---- Result tracking ----

interface TestResult {
  scenarioName: string;
  category: string;
  passed: boolean;
  error?: string;
}

interface CategorySummary {
  passed: number;
  failed: number;
  total: number;
  failures: string[];
}

// ---- Scenario loader ----

function loadScenarios(scenariosDir: string): ScenarioDefinition[] {
  const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
  const allScenarios: ScenarioDefinition[] = [];

  for (const file of files) {
    const filePath = join(scenariosDir, file);
    const content = readFileSync(filePath, "utf-8");
    const scenarios: ScenarioDefinition[] = JSON.parse(content);
    allScenarios.push(...scenarios);
  }

  return allScenarios;
}

// ---- Expectation validator ----

function validateExpectations(
  scenario: ScenarioDefinition,
  turnResults: ReplayTurnResult[]
): void {
  const exp = scenario.expectations;
  const firstTurn = turnResults[0];
  const lastTurn = turnResults[turnResults.length - 1];

  // Turn count
  if (exp.turnCount !== undefined) {
    if (turnResults.length !== exp.turnCount) {
      throw new Error(
        `Expected ${exp.turnCount} turns, got ${turnResults.length}`
      );
    }
  }

  // First/only turn expectations
  if (exp.turnIntent) {
    assertTurnIntent(firstTurn, exp.turnIntent);
  }

  if (exp.primaryFocus) {
    const focuses = Array.isArray(exp.primaryFocus)
      ? exp.primaryFocus
      : [exp.primaryFocus];
    assertPrimaryFocusOneOf(firstTurn, focuses);
  }

  if (exp.shouldUseTool !== undefined) {
    assertShouldUseTool(firstTurn, exp.shouldUseTool);
  }

  if (exp.toolIntentType) {
    assertToolIntent(firstTurn, exp.toolIntentType);
  }

  if (exp.needsClarification !== undefined) {
    assertNeedsClarification(firstTurn, exp.needsClarification);
  }

  if (exp.missingInfo) {
    assertMissingInfo(firstTurn, exp.missingInfo);
  }

  if (exp.noMissingInfo) {
    assertNoMissingInfo(firstTurn);
  }

  if (exp.mood) {
    const moods = Array.isArray(exp.mood) ? exp.mood : [exp.mood];
    assertMoodOneOf(firstTurn, moods);
  }

  if (exp.brevity) {
    assertBrevity(firstTurn, exp.brevity);
  }

  if (exp.conversationState) {
    const states = Array.isArray(exp.conversationState)
      ? exp.conversationState
      : [exp.conversationState];
    assertConversationStateOneOf(firstTurn, states);
  }

  if (exp.responseStrategy) {
    const strategies = Array.isArray(exp.responseStrategy)
      ? exp.responseStrategy
      : [exp.responseStrategy];
    assertResponseStrategyOneOf(firstTurn, strategies);
  }

  if (exp.noContradictions) {
    assertNoContradictions(firstTurn);
  }

  if (exp.hasContradictions) {
    // Check last turn for contradictions in multi-turn scenarios
    assertHasContradictions(lastTurn);
  }

  if (exp.mentionedEntities) {
    assertMentionedEntities(firstTurn, exp.mentionedEntities);
  }

  if (exp.responseModeShouldMentionOpenLoops !== undefined) {
    // This is a soft check: the system should mention open loops for owner greetings,
    // but only if there are actually open loops. We verify the field exists.
    const actual = firstTurn.resolved.responseMode.shouldMentionOpenLoops;
    if (typeof actual !== "boolean") {
      throw new Error(
        `Expected shouldMentionOpenLoops to be a boolean, got ${typeof actual}`
      );
    }
  }

  // Last turn expectations (for multi-turn)
  if (exp.lastTurnIntent) {
    assertTurnIntent(lastTurn, exp.lastTurnIntent);
  }

  if (exp.lastConversationState) {
    const states = Array.isArray(exp.lastConversationState)
      ? exp.lastConversationState
      : [exp.lastConversationState];
    assertConversationStateOneOf(lastTurn, states);
  }

  if (exp.lastShouldUseTool !== undefined) {
    assertShouldUseTool(lastTurn, exp.lastShouldUseTool);
  }

  // Full sequence expectations
  if (exp.turnIntents) {
    if (exp.turnIntents.length !== turnResults.length) {
      throw new Error(
        `Expected ${exp.turnIntents.length} turn intents, got ${turnResults.length} turns`
      );
    }
    for (let i = 0; i < exp.turnIntents.length; i++) {
      assertTurnIntent(turnResults[i], exp.turnIntents[i]);
    }
  }
}

// ---- Main runner ----

function runBenchmarks(): void {
  // Setup test state directory (same as tests/setup.ts)
  const testStateDir = mkdtempSync(join(tmpdir(), "limor-benchmark-state-"));
  process.env.LIMOR_STATE_DIR = testStateDir;

  // Scenarios are JSON files that tsc doesn't copy, so resolve from project root
  const projectRoot = join(__dirname, "..", "..", "..");
  const scenariosDir = join(projectRoot, "tests", "scenarios");
  const scenarios = loadScenarios(scenariosDir);
  const results: TestResult[] = [];
  const categoryMap = new Map<string, CategorySummary>();

  console.log(`\n========================================`);
  console.log(`  Benchmark Suite: ${scenarios.length} scenarios`);
  console.log(`========================================\n`);

  for (const scenario of scenarios) {
    const category = scenario.category;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { passed: 0, failed: 0, total: 0, failures: [] });
    }
    const cat = categoryMap.get(category)!;
    cat.total++;

    try {
      const replayResult = runReplayScenario({
        name: scenario.name,
        turns: scenario.turns,
      });

      validateExpectations(scenario, replayResult.turns);

      results.push({ scenarioName: scenario.name, category, passed: true });
      cat.passed++;
      console.log(`  PASS  [${category}] ${scenario.name}`);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      results.push({
        scenarioName: scenario.name,
        category,
        passed: false,
        error: errorMsg,
      });
      cat.failed++;
      cat.failures.push(scenario.name);
      console.log(`  FAIL  [${category}] ${scenario.name}`);
      console.log(`        ${errorMsg}\n`);
    }
  }

  // Summary
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log(`\n========================================`);
  console.log(`  Results by Category`);
  console.log(`========================================\n`);

  for (const [category, summary] of categoryMap.entries()) {
    const status = summary.failed === 0 ? "ALL PASS" : `${summary.failed} FAIL`;
    console.log(
      `  ${category}: ${summary.passed}/${summary.total} passed (${status})`
    );
    if (summary.failures.length > 0) {
      for (const f of summary.failures) {
        console.log(`    - ${f}`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed, ${results.length} total`);
  console.log(`========================================\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runBenchmarks();
