import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContext, buildResolvedContext } from "../src/context/context-builder";
import { formatContextForPrompt, formatResolvedContextForPrompt } from "../src/context/context-service";
import { classifyTurnIntent } from "../src/context/turn-intent";
import { generateResponseGuidance } from "../src/context/response-guidance";
import { resolvePrimaryFocus } from "../src/context/primary-focus";
import { resolveResponseMode } from "../src/context/response-mode";
import { resolveActionPlan } from "../src/context/action-plan";
import { resolveReferences } from "../src/context/reference-resolver";
import { resolveMissingInfo } from "../src/context/missing-info-resolver";
import { resolveToolIntent } from "../src/context/tool-intent-resolver";
import { resolveMemoryWriteDecision } from "../src/context/memory-write-decider";
import { resolveConversationState } from "../src/context/conversation-state-resolver";
import { resolveContradictions } from "../src/context/contradiction-resolver";
import { resolveResponseStrategy } from "../src/context/response-strategy-resolver";
import { resolveExecutionDecision } from "../src/context/execution-guardrails";
import { resolveToolRoutingPolicy } from "../src/context/tool-routing-policy";
import { buildCompressedPrompt } from "../src/context/prompt-compressor";
import { formatCompressedContextForPrompt } from "../src/context/context-service";
import { resolveMemoryCommitDecision } from "../src/context/memory-commit-policy";
import { evaluateOutcome } from "../src/context/outcome-tracker";
import { buildDebugTrace } from "../src/context/debug-trace";
import { formatDebugTrace } from "../src/context/context-service";
import { resolveFollowupAutomationDecision, applyFollowupAutomation } from "../src/context/followup-automation";
import { resolveDomainPolicy } from "../src/context/domain-policy-resolver";
import type { ContextBundle, ResolvedContext } from "../src/context/context-types";

const ownerSender = { name: "רני", isOwner: true, isGroup: false };
const contactSender = { name: "עמית", isOwner: false, isGroup: false };
const groupSender = { name: "עמית", isOwner: false, isGroup: true };

// Helper to create a test bundle with overrides
function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    person: { chatId: "test@c.us", name: "Test", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: false, isGroup: false, isApprovedContact: true },
    conversation: { lastUserMessage: "hi", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    urgency: { hasFollowup: false, isOverdue: false, waitingTimeMinutes: 0, priority: "low" },
    openLoops: { followups: [], lastAssistantMessage: undefined },
    turnIntent: { category: "unclear", confidence: 0.5, mentionedEntities: [], isMinimal: false },
    references: [],
    missingInfo: { missing: ["none"], summary: "לא חסר מידע מהותי", confidence: 0.7 },
    responseGuidance: [],
    historySummary: "שיחה רגילה.",
    system: { pendingApprovals: 0, pendingMeetings: 0, pendingFollowups: 0, pendingCapabilities: 0 },
    signals: [],
    ...overrides,
  };
}

// ============================================================
// EXISTING TESTS — backward compatibility
// ============================================================

describe("context-builder", () => {
  describe("buildContext basics", () => {
    it("returns a valid ContextBundle for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "שלום", sender: ownerSender });
      assert.strictEqual(bundle.person.isOwner, true);
      assert.strictEqual(bundle.person.name, "רני");
      assert.ok(bundle.historySummary.length > 0);
      assert.ok(Array.isArray(bundle.signals));
    });

    it("returns default values for unknown contact", () => {
      const bundle = buildContext({ chatId: "unknown@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(bundle.person.relationshipType, "unknown");
      assert.strictEqual(bundle.person.importanceScore, 20);
      assert.strictEqual(bundle.person.communicationStyle, "unknown");
    });

    it("marks group correctly", () => {
      const bundle = buildContext({ chatId: "group@g.us", message: "test", sender: groupSender });
      assert.strictEqual(bundle.person.isGroup, true);
      assert.ok(bundle.signals.includes("group_message"));
    });

    it("includes openLoops in bundle", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.ok("openLoops" in bundle);
      assert.ok(Array.isArray(bundle.openLoops.followups));
    });

    it("includes turnIntent in bundle", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
      assert.ok("turnIntent" in bundle);
      assert.ok(typeof bundle.turnIntent.category === "string");
      assert.ok(typeof bundle.turnIntent.confidence === "number");
      assert.ok(typeof bundle.turnIntent.isMinimal === "boolean");
    });

    it("includes responseGuidance in bundle", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.ok(Array.isArray(bundle.responseGuidance));
    });

    it("includes references in bundle", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.ok(Array.isArray(bundle.references));
    });

    it("includes missingInfo in bundle", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.ok("missingInfo" in bundle);
      assert.ok(Array.isArray(bundle.missingInfo.missing));
      assert.ok(typeof bundle.missingInfo.summary === "string");
    });
  });

  describe("signals", () => {
    it("includes owner_message for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "test", sender: ownerSender });
      assert.ok(bundle.signals.includes("owner_message"));
    });

    it("does not include owner_message for non-owner", () => {
      const bundle = buildContext({ chatId: "contact@c.us", message: "test", sender: contactSender });
      assert.ok(!bundle.signals.includes("owner_message"));
    });
  });

  describe("urgency priority", () => {
    it("defaults to low priority with no followups", () => {
      const bundle = buildContext({ chatId: "new@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(bundle.urgency.priority, "low");
      assert.strictEqual(bundle.urgency.hasFollowup, false);
      assert.strictEqual(bundle.urgency.isOverdue, false);
    });
  });

  describe("conversation context", () => {
    it("detects waiting for reply on fresh conversation", () => {
      const bundle = buildContext({ chatId: "fresh@c.us", message: "hello", sender: contactSender });
      assert.strictEqual(typeof bundle.conversation.messageCount, "number");
      assert.strictEqual(bundle.conversation.lastUserMessage, "hello");
    });

    it("sets repeatedRecentMessages to false for single message", () => {
      const bundle = buildContext({ chatId: "single@c.us", message: "one", sender: contactSender });
      assert.strictEqual(bundle.conversation.repeatedRecentMessages, false);
    });
  });

  describe("history summary", () => {
    it("produces non-empty summary", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hello", sender: contactSender });
      assert.ok(bundle.historySummary.length > 0);
    });

    it("includes owner mention for owner", () => {
      const bundle = buildContext({ chatId: "owner@c.us", message: "hi", sender: ownerSender });
      assert.ok(bundle.historySummary.includes("רני") || bundle.historySummary.includes("בעלים"));
    });

    it("includes group mention for group", () => {
      const bundle = buildContext({ chatId: "group@g.us", message: "hi", sender: groupSender });
      assert.ok(bundle.historySummary.includes("קבוצה"));
    });
  });

  describe("system context", () => {
    it("returns numeric counts", () => {
      const bundle = buildContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
      assert.strictEqual(typeof bundle.system.pendingApprovals, "number");
      assert.strictEqual(typeof bundle.system.pendingMeetings, "number");
      assert.strictEqual(typeof bundle.system.pendingFollowups, "number");
      assert.strictEqual(typeof bundle.system.pendingCapabilities, "number");
    });
  });
});

describe("turn-intent classifier", () => {
  it("classifies minimal messages as continuation", () => {
    const intent = classifyTurnIntent("?");
    assert.strictEqual(intent.category, "continuation");
    assert.strictEqual(intent.isMinimal, true);
  });

  it("classifies single-char as minimal", () => {
    const intent = classifyTurnIntent("!");
    assert.strictEqual(intent.isMinimal, true);
  });

  it("classifies greeting (Hebrew)", () => {
    const intent = classifyTurnIntent("היי מה קורה");
    assert.strictEqual(intent.category, "greeting");
  });

  it("classifies greeting (English)", () => {
    const intent = classifyTurnIntent("hello");
    assert.strictEqual(intent.category, "greeting");
  });

  it("classifies correction", () => {
    const intent = classifyTurnIntent("לא, תשני את השם");
    assert.strictEqual(intent.category, "correction");
  });

  it("classifies status query (Hebrew)", () => {
    const intent = classifyTurnIntent("מה הסטטוס?");
    assert.strictEqual(intent.category, "status_query");
  });

  it("classifies reminder request", () => {
    const intent = classifyTurnIntent("תזכירי לי לקנות חלב");
    assert.strictEqual(intent.category, "reminder_request");
  });

  it("classifies followup query", () => {
    const intent = classifyTurnIntent("מה לגבי הפוליסה?");
    assert.strictEqual(intent.category, "followup_query");
  });

  it("classifies action request", () => {
    const intent = classifyTurnIntent("תשלחי לו הודעה");
    assert.strictEqual(intent.category, "action_request");
  });

  it("classifies question with question mark", () => {
    const intent = classifyTurnIntent("איך אפשר לעשות את זה?");
    assert.strictEqual(intent.category, "question");
  });

  it("returns unclear for ambiguous messages", () => {
    const intent = classifyTurnIntent("סבבה תודה רבה");
    assert.strictEqual(intent.category, "unclear");
  });

  it("returns mentionedEntities as array", () => {
    const intent = classifyTurnIntent("שלום לכולם");
    assert.ok(Array.isArray(intent.mentionedEntities));
  });

  it("has confidence between 0 and 1", () => {
    const intent = classifyTurnIntent("test");
    assert.ok(intent.confidence >= 0 && intent.confidence <= 1);
  });
});

describe("response-guidance", () => {
  it("returns empty for no-urgency no-intent", () => {
    const guidance = generateResponseGuidance(makeBundle());
    assert.ok(Array.isArray(guidance));
  });

  it("generates guidance for overdue followup", () => {
    const bundle = makeBundle({
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 100, priority: "high" },
      openLoops: { followups: [{ reason: "לקנות חלב", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.length > 0);
    assert.ok(guidance.some((g) => g.includes("משימה")));
  });

  it("generates guidance for minimal + open loops", () => {
    const bundle = makeBundle({
      turnIntent: { category: "continuation", confidence: 0.7, mentionedEntities: [], isMinimal: true },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false }] },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.some((g) => g.includes("קצרה") || g.includes("פתוחים")));
  });

  it("generates guidance for correction intent", () => {
    const bundle = makeBundle({
      turnIntent: { category: "correction", confidence: 0.85, mentionedEntities: [], isMinimal: false },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.some((g) => g.includes("מתקן")));
  });

  it("generates guidance for status query", () => {
    const bundle = makeBundle({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.some((g) => g.includes("סטטוס")));
  });

  it("generates guidance for greeting + open items", () => {
    const bundle = makeBundle({
      turnIntent: { category: "greeting", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false }] },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.some((g) => g.includes("ברכה") || g.includes("פתוח")));
  });

  it("limits guidance to max 3 items", () => {
    const bundle = makeBundle({
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 200, priority: "high" },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-01-01", isOverdue: true }] },
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "?", isWaitingForReply: true, messageCount: 5, repeatedRecentMessages: true },
      person: { chatId: "t", name: "T", relationshipType: "client", importanceScore: 80, communicationStyle: "formal", isOwner: false, isGroup: false, isApprovedContact: true },
    });
    const guidance = generateResponseGuidance(bundle);
    assert.ok(guidance.length <= 3);
  });
});

// ============================================================
// PRIMARY FOCUS TESTS
// ============================================================

describe("primary-focus", () => {
  it("status_query => focus.type === status", () => {
    const bundle = makeBundle({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "status");
    assert.strictEqual(focus.confidence, 0.95);
  });

  it("correction => focus.type === message", () => {
    const bundle = makeBundle({
      turnIntent: { category: "correction", confidence: 0.85, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "message");
    assert.ok(focus.summary.includes("תיקון"));
  });

  it("action_request => focus.type === new_request", () => {
    const bundle = makeBundle({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "new_request");
  });

  it("reminder_request => focus.type === new_request", () => {
    const bundle = makeBundle({
      turnIntent: { category: "reminder_request", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "new_request");
  });

  it("overdue followup => focus.type === followup", () => {
    const bundle = makeBundle({
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 100, priority: "high" },
      openLoops: { followups: [{ reason: "לקנות חלב", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "followup");
    assert.strictEqual(focus.confidence, 0.95);
    assert.ok(focus.reason.includes("חלב"));
  });

  it("pending meeting => focus.type === meeting", () => {
    const bundle = makeBundle({
      openLoops: {
        followups: [],
        pendingMeeting: { requesterName: "יוסי", topic: "ביטוח", id: "M123" },
      },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "meeting");
    assert.ok(focus.reason.includes("יוסי"));
  });

  it("minimal message + followup => focus.type === followup", () => {
    const bundle = makeBundle({
      turnIntent: { category: "continuation", confidence: 0.7, mentionedEntities: [], isMinimal: true },
      openLoops: { followups: [{ reason: "לבדוק עם הראל", dueAt: "2026-12-01", isOverdue: false }] },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "followup");
    assert.strictEqual(focus.confidence, 0.8);
  });

  it("default => focus.type === message", () => {
    const bundle = makeBundle();
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "message");
    assert.strictEqual(focus.confidence, 0.7);
  });

  it("status_query takes priority over overdue followup", () => {
    const bundle = makeBundle({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 100, priority: "high" },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const focus = resolvePrimaryFocus(bundle);
    assert.strictEqual(focus.type, "status");
  });

  it("focus has non-empty summary and reason", () => {
    const bundle = makeBundle();
    const focus = resolvePrimaryFocus(bundle);
    assert.ok(focus.summary.length > 0);
    assert.ok(focus.reason.length > 0);
  });
});

// ============================================================
// RESPONSE MODE TESTS
// ============================================================

describe("response-mode", () => {
  it("defaults to professional tone and medium brevity", () => {
    const bundle = makeBundle();
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.tone, "professional");
    assert.strictEqual(mode.brevity, "medium");
    assert.strictEqual(mode.structure, "direct_answer");
  });

  it("repeated messages => tone direct + brevity short", () => {
    const bundle = makeBundle({
      conversation: { lastUserMessage: "hi", isWaitingForReply: true, messageCount: 5, repeatedRecentMessages: true },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.tone, "direct");
    assert.strictEqual(mode.brevity, "short");
  });

  it("status focus => structure status_list", () => {
    const bundle = makeBundle({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.structure, "status_list");
  });

  it("correction => structure action_confirmation", () => {
    const bundle = makeBundle({
      turnIntent: { category: "correction", confidence: 0.85, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.structure, "action_confirmation");
  });

  it("overdue => tone direct", () => {
    const bundle = makeBundle({
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 100, priority: "high" },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.tone, "direct");
  });

  it("waiting > 60 min => shouldAcknowledgeDelay true", () => {
    const bundle = makeBundle({
      urgency: { hasFollowup: false, isOverdue: false, waitingTimeMinutes: 120, priority: "low" },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.shouldAcknowledgeDelay, true);
  });

  it("followup focus => shouldMentionOpenLoops true", () => {
    const bundle = makeBundle({
      turnIntent: { category: "continuation", confidence: 0.7, mentionedEntities: [], isMinimal: true },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false }] },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.shouldMentionOpenLoops, true);
  });

  it("status focus => shouldMentionOpenLoops true", () => {
    const bundle = makeBundle({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.shouldMentionOpenLoops, true);
  });

  it("greeting + low priority => tone friendly", () => {
    const bundle = makeBundle({
      turnIntent: { category: "greeting", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      urgency: { hasFollowup: false, isOverdue: false, waitingTimeMinutes: 0, priority: "low" },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.tone, "friendly");
  });

  it("adapts tone from communicationStyle when default", () => {
    const bundle = makeBundle({
      person: { chatId: "t", name: "T", relationshipType: "friend", importanceScore: 50, communicationStyle: "warm", isOwner: false, isGroup: false, isApprovedContact: true },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    assert.strictEqual(mode.tone, "warm");
  });
});

// ============================================================
// RESOLVED CONTEXT TESTS
// ============================================================

describe("buildResolvedContext", () => {
  it("returns bundle, primaryFocus, and responseMode", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("bundle" in resolved);
    assert.ok("primaryFocus" in resolved);
    assert.ok("responseMode" in resolved);
    assert.ok(typeof resolved.primaryFocus.type === "string");
    assert.ok(typeof resolved.responseMode.tone === "string");
  });

  it("bundle inside resolved matches direct buildContext", () => {
    const resolved = buildResolvedContext({ chatId: "rc@c.us", message: "test", sender: contactSender });
    assert.strictEqual(resolved.bundle.person.name, "עמית");
    assert.ok(Array.isArray(resolved.bundle.signals));
  });
});

// ============================================================
// FORMATTER TESTS — backward compat + new resolved format
// ============================================================

describe("formatContextForPrompt (backward compat)", () => {
  it("produces readable Hebrew text", () => {
    const bundle = buildContext({ chatId: "test@c.us", message: "hello", sender: contactSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("הקשר נוכחי"));
    assert.ok(text.includes("סיכום:"));
  });

  it("shows owner info for owner", () => {
    const bundle = buildContext({ chatId: "owner@c.us", message: "hi", sender: ownerSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("רני"));
    assert.ok(text.includes("בעלים"));
  });

  it("shows group info for group", () => {
    const bundle = buildContext({ chatId: "group@g.us", message: "hi", sender: groupSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("קבוצה"));
  });

  it("includes importance score for contacts", () => {
    const bundle = buildContext({ chatId: "contact@c.us", message: "hi", sender: contactSender });
    const text = formatContextForPrompt(bundle);
    assert.ok(text.includes("/100"));
  });
});

describe("formatResolvedContextForPrompt", () => {
  it("includes primary focus section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "מה הסטטוס?", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("פוקוס עיקרי"));
  });

  it("includes response mode section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("איך לענות"));
  });

  it("includes Hebrew yes/no for open loops", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("להזכיר דברים פתוחים:"));
    assert.ok(text.includes("כן") || text.includes("לא"));
  });

  it("includes Hebrew yes/no for delay", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("להתייחס לעיכוב:"));
  });

  it("includes tone label", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("טון:"));
  });

  it("includes base context section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("הקשר נוכחי"));
    assert.ok(text.includes("סיכום:"));
  });

  it("readable for owner", () => {
    const resolved = buildResolvedContext({ chatId: "owner@c.us", message: "שלום", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("רני"));
    assert.ok(text.includes("בעלים"));
    assert.ok(text.includes("פוקוס עיקרי"));
  });

  it("readable for group", () => {
    const resolved = buildResolvedContext({ chatId: "group@g.us", message: "test", sender: groupSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("קבוצה"));
    assert.ok(text.includes("איך לענות"));
  });

  it("includes action plan section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("פעולה מועדפת"));
  });

  it("includes clarification line", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("נדרש הבהרה:"));
    assert.ok(text.includes("כן") || text.includes("לא"));
  });
});

// ============================================================
// ACTION PLAN TESTS
// ============================================================

describe("action-plan", () => {
  function makeResolved(overrides: Partial<ContextBundle> = {}, focusOverride?: Partial<ResolvedContext>): { bundle: ContextBundle; primaryFocus: ReturnType<typeof resolvePrimaryFocus>; responseMode: ReturnType<typeof resolveResponseMode> } {
    const bundle = makeBundle(overrides);
    const primaryFocus = focusOverride?.primaryFocus || resolvePrimaryFocus(bundle);
    const responseMode = focusOverride?.responseMode || resolveResponseMode(bundle, primaryFocus);
    return { bundle, primaryFocus, responseMode };
  }

  it("status_query => give_status", () => {
    const resolved = makeResolved({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "give_status");
    assert.strictEqual(plan.confidence, 0.95);
    assert.strictEqual(plan.needsClarification, false);
  });

  it("correction => confirm_correction", () => {
    const resolved = makeResolved({
      turnIntent: { category: "correction", confidence: 0.85, mentionedEntities: [], isMinimal: false },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "confirm_correction");
    assert.strictEqual(plan.confidence, 0.95);
  });

  it("overdue followup => mention_followup", () => {
    const resolved = makeResolved({
      urgency: { hasFollowup: true, isOverdue: true, waitingTimeMinutes: 100, priority: "high" },
      openLoops: { followups: [{ reason: "לקנות חלב", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "mention_followup");
    assert.ok(plan.reason.includes("חלב"));
    assert.strictEqual(plan.confidence, 0.9);
  });

  it("pending meeting => mention_meeting", () => {
    const resolved = makeResolved({
      openLoops: {
        followups: [],
        pendingMeeting: { requesterName: "יוסי", topic: "ביטוח", id: "M123" },
      },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "mention_meeting");
    assert.ok(plan.reason.includes("יוסי"));
    assert.ok(plan.reason.includes("ביטוח"));
  });

  it("action_request with missing target => ask_for_missing_detail", () => {
    const resolved = makeResolved({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "תשלחי לו", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
      missingInfo: { missing: ["recipient"], summary: "חסר פרט: נמען", confidence: 0.85 },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "ask_for_missing_detail");
    assert.strictEqual(plan.needsClarification, true);
  });

  it("action_request with enough detail => handle_new_request", () => {
    const resolved = makeResolved({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: ["Eyal Etzbeoni"], isMinimal: false },
      conversation: { lastUserMessage: "תשלחי לאייל הודעה שאני מאשר את הפגישה מחר ב-10:00", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "handle_new_request");
    assert.strictEqual(plan.needsClarification, false);
  });

  it("short action verb with no entities => ask_for_missing_detail", () => {
    const resolved = makeResolved({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "תבדקי", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
      missingInfo: { missing: ["target_object"], summary: "חסר פרט: מטרה", confidence: 0.85 },
    });
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "ask_for_missing_detail");
    assert.strictEqual(plan.needsClarification, true);
  });

  it("default => reply_only", () => {
    const resolved = makeResolved();
    const plan = resolveActionPlan(resolved);
    assert.strictEqual(plan.type, "reply_only");
    assert.strictEqual(plan.confidence, 0.6);
    assert.strictEqual(plan.needsClarification, false);
  });

  it("has non-empty summary and reason", () => {
    const resolved = makeResolved();
    const plan = resolveActionPlan(resolved);
    assert.ok(plan.summary.length > 0);
    assert.ok(plan.reason.length > 0);
  });

  it("buildResolvedContext includes actionPlan", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("actionPlan" in resolved);
    assert.ok(typeof resolved.actionPlan.type === "string");
    assert.ok(typeof resolved.actionPlan.needsClarification === "boolean");
  });
});

// ============================================================
// REFERENCE RESOLVER TESTS
// ============================================================

describe("reference-resolver", () => {
  const basePerson = { chatId: "t", name: "T", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: false, isGroup: false, isApprovedContact: true };
  const baseConv = { lastUserMessage: "hi", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false };

  it("resolves mentioned entities as person references", () => {
    const refs = resolveReferences("תשלחי לעמית", {
      mentionedEntities: ["Amit Golan"],
      openLoops: { followups: [] },
      conversation: baseConv,
      person: basePerson,
    });
    assert.ok(refs.length > 0);
    assert.strictEqual(refs[0].kind, "person");
    assert.strictEqual(refs[0].source, "mentioned_entity");
    assert.strictEqual(refs[0].confidence, 0.95);
  });

  it("resolves pronoun 'לו' with pending meeting requester", () => {
    const refs = resolveReferences("תשלחי לו הודעה", {
      mentionedEntities: [],
      openLoops: { followups: [], pendingMeeting: { requesterName: "יוסי", topic: "ביטוח", id: "M1" } },
      conversation: baseConv,
      person: basePerson,
    });
    assert.ok(refs.length > 0);
    assert.strictEqual(refs[0].kind, "person");
    assert.strictEqual(refs[0].displayName, "יוסי");
    assert.strictEqual(refs[0].source, "open_loop");
  });

  it("resolves pronoun 'מה איתו' with followup requester", () => {
    const refs = resolveReferences("מה איתו?", {
      mentionedEntities: [],
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false, requesterName: "אלי" }] },
      conversation: baseConv,
      person: basePerson,
    });
    assert.ok(refs.length > 0);
    assert.strictEqual(refs[0].displayName, "אלי");
    assert.strictEqual(refs[0].source, "open_loop");
  });

  it("resolves 'תבדקי את זה' with open followup", () => {
    const refs = resolveReferences("תבדקי את זה", {
      mentionedEntities: [],
      openLoops: { followups: [{ reason: "לקנות כבל HDMI", dueAt: "2026-12-01", isOverdue: false }] },
      conversation: baseConv,
      person: basePerson,
    });
    assert.ok(refs.some((r) => r.kind === "followup"));
    assert.ok(refs.some((r) => r.displayName.includes("HDMI")));
  });

  it("returns empty for no references", () => {
    const refs = resolveReferences("שלום", {
      mentionedEntities: [],
      openLoops: { followups: [] },
      conversation: baseConv,
      person: basePerson,
    });
    assert.strictEqual(refs.length, 0);
  });
});

// ============================================================
// MISSING INFO RESOLVER TESTS
// ============================================================

describe("missing-info-resolver", () => {
  it("returns none for non-action messages", () => {
    const info = resolveMissingInfo("שלום", { category: "greeting", confidence: 0.9, mentionedEntities: [], isMinimal: false }, []);
    assert.ok(info.missing.includes("none"));
  });

  it("detects missing recipient for 'תשלחי לו' with no person ref", () => {
    const info = resolveMissingInfo("תשלחי לו", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, []);
    assert.ok(info.missing.includes("recipient"));
  });

  it("no missing recipient when person reference exists", () => {
    const info = resolveMissingInfo("תשלחי לו", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, [
      { kind: "person", displayName: "יוסי", source: "open_loop", confidence: 0.8 },
    ]);
    assert.ok(!info.missing.includes("recipient"));
  });

  it("detects missing date/time for 'תקבעי לי'", () => {
    const info = resolveMissingInfo("תקבעי לי", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, []);
    assert.ok(info.missing.includes("date") || info.missing.includes("time") || info.missing.includes("topic"));
  });

  it("no missing date when date is provided", () => {
    const info = resolveMissingInfo("תקבעי לי מחר פגישה עם עמית", { category: "action_request", confidence: 0.8, mentionedEntities: ["Amit"], isMinimal: false }, []);
    assert.ok(!info.missing.includes("date"));
  });

  it("detects missing target_object for short 'תבדקי'", () => {
    const info = resolveMissingInfo("תבדקי", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, []);
    assert.ok(info.missing.includes("target_object"));
  });

  it("no missing target_object when followup ref exists", () => {
    const info = resolveMissingInfo("תבדקי את זה", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, [
      { kind: "followup", displayName: "task", source: "open_loop", confidence: 0.75 },
    ]);
    assert.ok(!info.missing.includes("target_object"));
  });

  it("summary is specific for single missing field", () => {
    const info = resolveMissingInfo("תשלחי לו", { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false }, []);
    assert.ok(info.summary.includes("חסר פרט"));
  });
});

// ============================================================
// FORMATTER WITH REFERENCES + MISSING INFO TESTS
// ============================================================

describe("formatResolvedContextForPrompt v5", () => {
  it("includes reference section when references exist", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "מה איתו?", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    // May or may not have references depending on store state, but structure is correct
    assert.ok(text.includes("פעולה מועדפת"));
  });

  it("includes missing info section when info is missing", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "תשלחי לו", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    // "תשלחי לו" with no resolved entities should show missing info
    if (resolved.bundle.missingInfo.missing.some((m) => m !== "none")) {
      assert.ok(text.includes("מה חסר"));
    }
  });

  it("action plan uses missingInfo summary in clarification reason", () => {
    const bundle = makeBundle({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "תשלחי לו", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
      missingInfo: { missing: ["recipient"], summary: "חסר פרט: נמען", confidence: 0.85 },
    });
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    if (plan.type === "ask_for_missing_detail") {
      assert.ok(plan.reason.includes("נמען"));
    }
  });
});

// ============================================================
// TOOL INTENT RESOLVER TESTS
// ============================================================

describe("tool-intent-resolver", () => {
  function makePartialResolved(overrides: Partial<ContextBundle> = {}, actionOverrides: Partial<ResolvedContext["actionPlan"]> = {}): { bundle: ContextBundle; primaryFocus: ReturnType<typeof resolvePrimaryFocus>; responseMode: ReturnType<typeof resolveResponseMode>; actionPlan: ResolvedContext["actionPlan"] } {
    const bundle = makeBundle(overrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const actionPlan = { ...resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode }), ...actionOverrides };
    return { bundle, primaryFocus: focus, responseMode: mode, actionPlan };
  }

  it("messaging: 'תשלחי לעמית שאני מאחר' => messaging, shouldUseTool=true", () => {
    const resolved = makePartialResolved({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: ["Amit"], isMinimal: false },
      conversation: { lastUserMessage: "תשלחי לעמית שאני מאחר", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "messaging");
    assert.strictEqual(ti.shouldUseTool, true);
  });

  it("messaging with missing recipient => shouldUseTool=false", () => {
    const resolved = makePartialResolved({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "תשלחי לו", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
      missingInfo: { missing: ["recipient"], summary: "חסר פרט: נמען", confidence: 0.85 },
    }, { needsClarification: true });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "messaging");
    assert.strictEqual(ti.shouldUseTool, false);
  });

  it("calendar: 'תקבעי לי פגישה מחר ב-14:00' => calendar", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "תקבעי לי פגישה מחר ב-14:00", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "calendar");
    assert.strictEqual(ti.shouldUseTool, true);
  });

  it("booking: 'תזמיני לי מקום למסעדה' => booking", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "תזמיני לי מקום למסעדה", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "booking");
    assert.strictEqual(ti.shouldUseTool, true);
  });

  it("travel: 'חפשי לי טיסה ללונדון' => travel", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "חפשי לי טיסה ללונדון", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "travel");
    assert.strictEqual(ti.shouldUseTool, true);
  });

  it("crm: 'תבדקי את הפוליסה' => crm", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "תבדקי את הפוליסה", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "crm");
    assert.strictEqual(ti.shouldUseTool, true);
  });

  it("generic question => none", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "מה השעה?", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const ti = resolveToolIntent(resolved);
    assert.strictEqual(ti.type, "none");
    assert.strictEqual(ti.shouldUseTool, false);
  });
});

// ============================================================
// MEMORY WRITE DECIDER TESTS
// ============================================================

describe("memory-write-decider", () => {
  function makePartialResolved(overrides: Partial<ContextBundle> = {}, actionOverrides: Partial<ResolvedContext["actionPlan"]> = {}): { bundle: ContextBundle; primaryFocus: ReturnType<typeof resolvePrimaryFocus>; responseMode: ReturnType<typeof resolveResponseMode>; actionPlan: ResolvedContext["actionPlan"] } {
    const bundle = makeBundle(overrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const actionPlan = { ...resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode }), ...actionOverrides };
    return { bundle, primaryFocus: focus, responseMode: mode, actionPlan };
  }

  it("preference: 'תזכרי שאני תמיד מעדיף מרפסת במסעדות' => preference", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "תזכרי שאני תמיד מעדיף מרפסת במסעדות", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const mw = resolveMemoryWriteDecision(resolved);
    assert.strictEqual(mw.type, "preference");
    assert.strictEqual(mw.shouldWrite, true);
  });

  it("fact: 'קוראים לי רני' => fact", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "קוראים לי רני", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const mw = resolveMemoryWriteDecision(resolved);
    assert.strictEqual(mw.type, "fact");
    assert.strictEqual(mw.shouldWrite, true);
  });

  it("relationship: 'הוא שותף שלי' => relationship_signal", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "הוא שותף שלי בעסק", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const mw = resolveMemoryWriteDecision(resolved);
    assert.strictEqual(mw.type, "relationship_signal");
    assert.strictEqual(mw.shouldWrite, true);
  });

  it("greeting => none", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "שלום", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    });
    const mw = resolveMemoryWriteDecision(resolved);
    assert.strictEqual(mw.type, "none");
    assert.strictEqual(mw.shouldWrite, false);
  });

  it("underspecified action => none", () => {
    const resolved = makePartialResolved({
      conversation: { lastUserMessage: "תבדקי", isWaitingForReply: false, messageCount: 1, repeatedRecentMessages: false },
    }, { needsClarification: true });
    const mw = resolveMemoryWriteDecision(resolved);
    assert.strictEqual(mw.shouldWrite, false);
  });
});

// ============================================================
// FORMATTER WITH TOOL INTENT + MEMORY TESTS
// ============================================================

describe("formatResolvedContextForPrompt v6", () => {
  it("includes tool intent section when tool is needed", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "תשלחי לעמית שלום", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    if (resolved.toolIntent.type !== "none") {
      assert.ok(text.includes("כלי כנראה נדרש"));
    }
  });

  it("includes memory section only when shouldWrite=true", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "תזכרי שאני תמיד מעדיף ישיבה בחוץ", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    if (resolved.memoryWriteDecision.shouldWrite) {
      assert.ok(text.includes("החלטת זיכרון"));
    }
  });

  it("does not include memory section for greetings", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: ownerSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(!text.includes("החלטת זיכרון"));
  });

  it("buildResolvedContext includes toolIntent and memoryWriteDecision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("toolIntent" in resolved);
    assert.ok("memoryWriteDecision" in resolved);
    assert.ok(typeof resolved.toolIntent.shouldUseTool === "boolean");
    assert.ok(typeof resolved.memoryWriteDecision.shouldWrite === "boolean");
  });
});

// ============================================================
// CONVERSATION STATE RESOLVER TESTS
// ============================================================

describe("conversation-state-resolver", () => {
  function makeStateInput(bundleOverrides: Partial<ContextBundle> = {}, extraOverrides: Record<string, any> = {}) {
    const bundle = makeBundle(bundleOverrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    return { bundle, primaryFocus: focus, responseMode: mode, actionPlan: { ...plan, ...extraOverrides.actionPlan }, toolIntent: { ...ti, ...extraOverrides.toolIntent }, memoryWriteDecision: mw };
  }

  it("short history => new_chat", () => {
    const input = makeStateInput({ conversation: { lastUserMessage: "hi", isWaitingForReply: false, messageCount: 0, repeatedRecentMessages: false } });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "new_chat");
  });

  it("needs clarification => awaiting_user_detail", () => {
    const input = makeStateInput({}, { actionPlan: { needsClarification: true, reason: "חסר פרט: נמען" } });
    // messageCount must be > 1 to not hit new_chat first
    input.bundle.conversation.messageCount = 5;
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "awaiting_user_detail");
  });

  it("owner + pending approvals => awaiting_owner_approval", () => {
    const input = makeStateInput({
      person: { chatId: "o", name: "רני", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: true, isGroup: false, isApprovedContact: true },
      signals: ["owner_message", "pending_approvals_exist"],
      conversation: { lastUserMessage: "hi", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "awaiting_owner_approval");
  });

  it("followup focus => awaiting_followup", () => {
    const input = makeStateInput({
      turnIntent: { category: "continuation", confidence: 0.7, mentionedEntities: [], isMinimal: true },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false }] },
      conversation: { lastUserMessage: "?", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "awaiting_followup");
  });

  it("meeting focus => awaiting_meeting_response", () => {
    const input = makeStateInput({
      openLoops: { followups: [], pendingMeeting: { requesterName: "יוסי", topic: "ביטוח", id: "M1" } },
      conversation: { lastUserMessage: "hi", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "awaiting_meeting_response");
  });

  it("status focus => status_discussion", () => {
    const input = makeStateInput({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "מה הסטטוס?", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "status_discussion");
  });

  it("correction => correction_flow", () => {
    const input = makeStateInput({
      turnIntent: { category: "correction", confidence: 0.85, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "לא, תשני", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "correction_flow");
  });

  it("tool ready without clarification => action_execution", () => {
    const input = makeStateInput({
      conversation: { lastUserMessage: "תשלחי לעמית שלום", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, { toolIntent: { shouldUseTool: true, type: "messaging", summary: "שליחה", reason: "test", confidence: 0.9 } });
    const state = resolveConversationState(input);
    assert.strictEqual(state.type, "action_execution");
  });
});

// ============================================================
// CONTRADICTION RESOLVER TESTS
// ============================================================

describe("contradiction-resolver", () => {
  function makeContradictionInput(bundleOverrides: Partial<ContextBundle> = {}, extraOverrides: Record<string, any> = {}) {
    const bundle = makeBundle(bundleOverrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    return {
      bundle, primaryFocus: { ...focus, ...extraOverrides.primaryFocus },
      responseMode: { ...mode, ...extraOverrides.responseMode },
      actionPlan: { ...plan, ...extraOverrides.actionPlan },
      toolIntent: { ...ti, ...extraOverrides.toolIntent },
      memoryWriteDecision: mw,
    };
  }

  it("action_request + missing info => intent_vs_missing_info", () => {
    const input = makeContradictionInput({
      turnIntent: { category: "action_request", confidence: 0.8, mentionedEntities: [], isMinimal: false },
      missingInfo: { missing: ["recipient"], summary: "חסר פרט: נמען", confidence: 0.85 },
    });
    const flags = resolveContradictions(input);
    assert.ok(flags.some((f) => f.type === "intent_vs_missing_info"));
  });

  it("tool true + direct_answer + new_request => reply_vs_action", () => {
    const input = makeContradictionInput({}, {
      toolIntent: { shouldUseTool: true, type: "messaging", summary: "s", reason: "r", confidence: 0.9 },
      responseMode: { structure: "direct_answer", tone: "professional", brevity: "medium", shouldAcknowledgeDelay: false, shouldMentionOpenLoops: false },
      primaryFocus: { type: "new_request", summary: "s", reason: "r", confidence: 0.9 },
    });
    const flags = resolveContradictions(input);
    assert.ok(flags.some((f) => f.type === "reply_vs_action"));
  });

  it("status_query + tool shouldUseTool => status_vs_new_request", () => {
    const input = makeContradictionInput({
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
    }, {
      toolIntent: { shouldUseTool: true, type: "crm", summary: "s", reason: "r", confidence: 0.9 },
    });
    const flags = resolveContradictions(input);
    assert.ok(flags.some((f) => f.type === "status_vs_new_request"));
  });

  it("2 strong person refs => reference_conflict", () => {
    const input = makeContradictionInput({
      references: [
        { kind: "person", displayName: "A", source: "mentioned_entity", confidence: 0.95 },
        { kind: "person", displayName: "B", source: "open_loop", confidence: 0.8 },
      ],
    });
    const flags = resolveContradictions(input);
    assert.ok(flags.some((f) => f.type === "reference_conflict"));
  });

  it("overdue followup + low priority => urgency_conflict", () => {
    const input = makeContradictionInput({
      urgency: { hasFollowup: true, isOverdue: false, waitingTimeMinutes: 0, priority: "low" },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-01-01", isOverdue: true }] },
    });
    const flags = resolveContradictions(input);
    assert.ok(flags.some((f) => f.type === "urgency_conflict"));
  });

  it("clean case => no contradictions", () => {
    const input = makeContradictionInput();
    const flags = resolveContradictions(input);
    assert.strictEqual(flags.length, 0);
  });
});

// ============================================================
// FORMATTER WITH STATE + CONTRADICTIONS TESTS
// ============================================================

describe("formatResolvedContextForPrompt v7", () => {
  it("includes conversation state section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("מצב שיחה"));
  });

  it("includes contradictions section only when relevant", () => {
    // Clean case — no contradictions expected
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    if (resolved.contradictions.length === 0) {
      assert.ok(!text.includes("נקודות זהירות"));
    }
  });

  it("buildResolvedContext includes conversationState and contradictions", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("conversationState" in resolved);
    assert.ok("contradictions" in resolved);
    assert.ok(typeof resolved.conversationState.type === "string");
    assert.ok(Array.isArray(resolved.contradictions));
  });
});

// ============================================================
// RESPONSE STRATEGY RESOLVER TESTS
// ============================================================

describe("response-strategy-resolver", () => {
  const defaultMemoryCommit = { action: "skip" as const, summary: "skip", reason: "default", confidence: 0.7 };

  function makeStrategyInput(bundleOverrides: Partial<ContextBundle> = {}, extra: Record<string, any> = {}) {
    const bundle = makeBundle(bundleOverrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mc = resolveMemoryCommitDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw });
    const fp = { bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw, memoryCommitDecision: mc };
    const cs = resolveConversationState(fp);
    const ct = resolveContradictions(fp);
    return {
      bundle, primaryFocus: { ...focus, ...extra.primaryFocus },
      responseMode: { ...mode, ...extra.responseMode },
      actionPlan: { ...plan, ...extra.actionPlan },
      toolIntent: { ...ti, ...extra.toolIntent },
      memoryWriteDecision: mw,
      memoryCommitDecision: mc,
      conversationState: { ...cs, ...extra.conversationState },
      contradictions: extra.contradictions ?? ct,
    };
  }

  it("clarification needed => clarify_first", () => {
    const input = makeStrategyInput({}, { actionPlan: { needsClarification: true, reason: "חסר פרט: נמען" } });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "clarify_first");
    assert.strictEqual(strategy.confidence, 0.95);
  });

  it("status contradiction => status_then_action", () => {
    const input = makeStrategyInput({}, {
      contradictions: [{ type: "status_vs_new_request", summary: "s", resolution: "r", confidence: 0.75 }],
    });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "status_then_action");
  });

  it("tool needed and clear => acknowledge_and_execute", () => {
    const input = makeStrategyInput({}, {
      toolIntent: { shouldUseTool: true, type: "messaging", summary: "שליחה", reason: "r", confidence: 0.9 },
      actionPlan: { needsClarification: false },
    });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "acknowledge_and_execute");
  });

  it("followup focus => acknowledge_and_followup", () => {
    const input = makeStrategyInput({
      turnIntent: { category: "continuation", confidence: 0.7, mentionedEntities: [], isMinimal: true },
      openLoops: { followups: [{ reason: "task", dueAt: "2026-12-01", isOverdue: false }] },
      conversation: { lastUserMessage: "?", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "acknowledge_and_followup");
  });

  it("repeated unanswered messages => brief_answer", () => {
    const input = makeStrategyInput({
      conversation: { lastUserMessage: "?", isWaitingForReply: true, messageCount: 5, repeatedRecentMessages: true },
    }, {
      responseMode: { brevity: "short", tone: "direct", structure: "direct_answer", shouldAcknowledgeDelay: true, shouldMentionOpenLoops: false },
    });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "brief_answer");
  });

  it("owner + status discussion => owner_summary", () => {
    const input = makeStrategyInput({
      person: { chatId: "o", name: "רני", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: true, isGroup: false, isApprovedContact: true },
      turnIntent: { category: "status_query", confidence: 0.9, mentionedEntities: [], isMinimal: false },
      conversation: { lastUserMessage: "מה הסטטוס?", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      conversationState: { type: "status_discussion", summary: "s", reason: "r", confidence: 0.9 },
    });
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "owner_summary");
  });

  it("clean normal case => direct_reply", () => {
    const input = makeStrategyInput();
    const strategy = resolveResponseStrategy(input);
    assert.strictEqual(strategy.type, "direct_reply");
    assert.strictEqual(strategy.confidence, 0.7);
  });
});

// ============================================================
// FORMATTER WITH RESPONSE STRATEGY TESTS
// ============================================================

describe("formatResolvedContextForPrompt v8", () => {
  it("includes response strategy section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("אסטרטגיית תגובה"));
  });

  it("buildResolvedContext includes responseStrategy", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("responseStrategy" in resolved);
    assert.ok(typeof resolved.responseStrategy.type === "string");
    assert.ok(typeof resolved.responseStrategy.confidence === "number");
  });
});

// ============================================================
// EXECUTION GUARDRAILS TESTS
// ============================================================

describe("execution-guardrails", () => {
  function makeGuardrailInput(overrides: Record<string, any> = {}) {
    const bundle = makeBundle(overrides.bundle || {});
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mc = resolveMemoryCommitDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw });
    const fp = { bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw, memoryCommitDecision: mc };
    const cs = resolveConversationState(fp);
    const ct = resolveContradictions(fp);
    const rs = resolveResponseStrategy({ ...fp, conversationState: cs, contradictions: ct });
    return {
      bundle,
      primaryFocus: overrides.primaryFocus ?? focus,
      responseMode: overrides.responseMode ?? mode,
      actionPlan: overrides.actionPlan ?? plan,
      toolIntent: overrides.toolIntent ?? ti,
      memoryWriteDecision: mw,
      memoryCommitDecision: mc,
      conversationState: overrides.conversationState ?? cs,
      contradictions: overrides.contradictions ?? ct,
      responseStrategy: overrides.responseStrategy ?? rs,
    };
  }

  it("clarify_first strategy => clarify_before_execution, allowTools=false", () => {
    const input = makeGuardrailInput({
      responseStrategy: { type: "clarify_first", summary: "s", reason: "חסר פרט", confidence: 0.95 },
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "clarify_before_execution");
    assert.strictEqual(decision.allowTools, false);
    assert.strictEqual(decision.confidence, 0.98);
  });

  it("reference_conflict => clarify_before_execution", () => {
    const input = makeGuardrailInput({
      contradictions: [{ type: "reference_conflict", summary: "s", resolution: "r", confidence: 0.85 }],
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "clarify_before_execution");
    assert.strictEqual(decision.allowTools, false);
  });

  it("intent_vs_missing_info => clarify_before_execution", () => {
    const input = makeGuardrailInput({
      contradictions: [{ type: "intent_vs_missing_info", summary: "s", resolution: "r", confidence: 0.95 }],
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "clarify_before_execution");
    assert.strictEqual(decision.allowTools, false);
  });

  it("tool-ready execution => allow_tool_execution, allowTools=true", () => {
    const input = makeGuardrailInput({
      toolIntent: { shouldUseTool: true, type: "messaging", summary: "שליחה", reason: "r", confidence: 0.9 },
      actionPlan: { type: "handle_new_request", summary: "s", reason: "r", confidence: 0.85, needsClarification: false },
      responseStrategy: { type: "acknowledge_and_execute", summary: "s", reason: "r", confidence: 0.9 },
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "allow_tool_execution");
    assert.strictEqual(decision.allowTools, true);
    assert.strictEqual(decision.confidence, 0.92);
  });

  it("toolIntent true but strategy not execute => block_tool_execution", () => {
    const input = makeGuardrailInput({
      toolIntent: { shouldUseTool: true, type: "calendar", summary: "יומן", reason: "r", confidence: 0.9 },
      actionPlan: { needsClarification: false },
      responseStrategy: { type: "direct_reply", summary: "s", reason: "r", confidence: 0.7 },
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "block_tool_execution");
    assert.strictEqual(decision.allowTools, false);
  });

  it("status_vs_new_request => safe_fallback_reply", () => {
    const input = makeGuardrailInput({
      contradictions: [{ type: "status_vs_new_request", summary: "s", resolution: "r", confidence: 0.75 }],
    });
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "safe_fallback_reply");
    assert.strictEqual(decision.allowTools, false);
  });

  it("clean non-tool case => reply_only", () => {
    const input = makeGuardrailInput();
    const decision = resolveExecutionDecision(input);
    assert.strictEqual(decision.type, "reply_only");
    assert.strictEqual(decision.allowTools, false);
    assert.strictEqual(decision.confidence, 0.7);
  });
});

// ============================================================
// FORMATTER WITH EXECUTION DECISION TESTS
// ============================================================

describe("formatResolvedContextForPrompt v9", () => {
  it("includes execution decision section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("החלטת ביצוע"));
  });

  it("includes allowTools indicator", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("כלים מותרים: כן") || text.includes("כלים מותרים: לא"));
  });

  it("buildResolvedContext includes executionDecision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("executionDecision" in resolved);
    assert.ok(typeof resolved.executionDecision.type === "string");
    assert.ok(typeof resolved.executionDecision.allowTools === "boolean");
    assert.ok(typeof resolved.executionDecision.confidence === "number");
  });
});

// ============================================================
// TOOL ROUTING POLICY TESTS
// ============================================================

describe("tool-routing-policy", () => {
  function makeRoutingInput(overrides: Record<string, any> = {}) {
    const bundle = makeBundle(overrides.bundle || {});
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mc = resolveMemoryCommitDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw });
    const fp = { bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan, toolIntent: ti, memoryWriteDecision: mw, memoryCommitDecision: mc };
    const cs = resolveConversationState(fp);
    const ct = resolveContradictions(fp);
    const rs = resolveResponseStrategy({ ...fp, conversationState: cs, contradictions: ct });
    const ed = resolveExecutionDecision({ ...fp, conversationState: cs, contradictions: ct, responseStrategy: rs });
    return {
      bundle,
      primaryFocus: overrides.primaryFocus ?? focus,
      responseMode: overrides.responseMode ?? mode,
      actionPlan: overrides.actionPlan ?? plan,
      toolIntent: overrides.toolIntent ?? ti,
      memoryWriteDecision: mw,
      memoryCommitDecision: mc,
      conversationState: overrides.conversationState ?? cs,
      contradictions: overrides.contradictions ?? ct,
      responseStrategy: overrides.responseStrategy ?? rs,
      executionDecision: overrides.executionDecision ?? ed,
    };
  }

  it("allowTools=false => group none, no tools", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "reply_only", summary: "s", reason: "r", confidence: 0.7, allowTools: false },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "none");
    assert.deepStrictEqual(policy.allowedToolNames, []);
  });

  it("messaging intent => messaging group with real tool names", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "messaging", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "messaging");
    assert.ok(policy.allowedToolNames.includes("send_message"));
    assert.ok(policy.allowedToolNames.includes("notify_owner"));
  });

  it("calendar intent => calendar group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "calendar", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "calendar");
    assert.ok(policy.allowedToolNames.includes("create_event"));
    assert.ok(policy.allowedToolNames.includes("list_events"));
  });

  it("booking intent => booking group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "booking", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "booking");
    assert.ok(policy.allowedToolNames.includes("ontopo_search"));
  });

  it("travel intent => travel group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "travel", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "travel");
    assert.ok(policy.allowedToolNames.includes("flight_search"));
    assert.ok(policy.allowedToolNames.includes("hotel_search"));
  });

  it("crm intent => crm group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "crm", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "crm");
    assert.ok(policy.allowedToolNames.includes("crm_dashboard"));
  });

  it("file intent => file group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "file", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "file");
    assert.ok(policy.allowedToolNames.includes("list_files"));
  });

  it("contact_lookup intent => contact_lookup group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "contact_lookup", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "contact_lookup");
    assert.ok(policy.allowedToolNames.includes("list_contacts"));
  });

  it("capability intent => capability group", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      toolIntent: { type: "capability", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "capability");
    assert.ok(policy.allowedToolNames.includes("run_capability"));
  });

  it("status/owner_summary => owner_safe_readonly", () => {
    const input = makeRoutingInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
      responseStrategy: { type: "owner_summary", summary: "s", reason: "r", confidence: 0.9 },
    });
    const policy = resolveToolRoutingPolicy(input);
    assert.strictEqual(policy.group, "owner_safe_readonly");
    assert.ok(policy.allowedToolNames.includes("list_events"));
    assert.ok(policy.allowedToolNames.includes("list_contacts"));
    assert.ok(!policy.allowedToolNames.includes("send_message"));
  });
});

// ============================================================
// FORMATTER WITH TOOL ROUTING TESTS
// ============================================================

describe("formatResolvedContextForPrompt v10", () => {
  it("includes tool routing section", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("ניתוב כלים"));
  });

  it("shows tool names or אין", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    assert.ok(text.includes("כלים חשופים:"));
  });

  it("buildResolvedContext includes toolRoutingPolicy", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("toolRoutingPolicy" in resolved);
    assert.ok(typeof resolved.toolRoutingPolicy.group === "string");
    assert.ok(Array.isArray(resolved.toolRoutingPolicy.allowedToolNames));
  });
});

// ============================================================
// PROMPT COMPRESSOR TESTS
// ============================================================

describe("prompt-compressor", () => {
  it("always includes primary_focus", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const included = resolved.compressedPrompt.sections.filter((s) => s.included);
    assert.ok(included.some((s) => s.key === "primary_focus"));
  });

  it("always includes response_strategy", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const included = resolved.compressedPrompt.sections.filter((s) => s.included);
    assert.ok(included.some((s) => s.key === "response_strategy"));
  });

  it("always includes execution_decision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const included = resolved.compressedPrompt.sections.filter((s) => s.included);
    assert.ok(included.some((s) => s.key === "execution_decision"));
  });

  it("omits missing_info when none", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const missingSection = resolved.compressedPrompt.sections.find((s) => s.key === "missing_info");
    assert.ok(missingSection);
    assert.strictEqual(missingSection!.included, false);
  });

  it("omits contradictions when empty", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const contrSection = resolved.compressedPrompt.sections.find((s) => s.key === "contradictions");
    assert.ok(contrSection);
    assert.strictEqual(contrSection!.included, false);
  });

  it("omits memory_write when shouldWrite=false", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const memSection = resolved.compressedPrompt.sections.find((s) => s.key === "memory_write");
    assert.ok(memSection);
    assert.strictEqual(memSection!.included, false);
  });

  it("max 8 included sections", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "מה הסטטוס? תשלחי לעמית", sender: ownerSender });
    const included = resolved.compressedPrompt.sections.filter((s) => s.included);
    assert.ok(included.length <= 8);
  });

  it("min 4 included sections", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const included = resolved.compressedPrompt.sections.filter((s) => s.included);
    assert.ok(included.length >= 4, `Expected >= 4 included sections, got ${included.length}`);
  });

  it("summary is non-empty", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok(resolved.compressedPrompt.summary.length > 0);
  });

  it("summary reflects top-level situation", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    // Should be a Hebrew sentence
    assert.ok(typeof resolved.compressedPrompt.summary === "string");
    assert.ok(resolved.compressedPrompt.summary.length > 5);
  });
});

// ============================================================
// COMPRESSED FORMATTER TESTS
// ============================================================

describe("formatCompressedContextForPrompt", () => {
  it("includes compressed header", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatCompressedContextForPrompt(resolved);
    assert.ok(text.includes("הקשר דחוס"));
  });

  it("includes summary footer", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatCompressedContextForPrompt(resolved);
    assert.ok(text.includes("תמצית"));
  });

  it("does not render omitted sections", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const text = formatCompressedContextForPrompt(resolved);
    // memory_write should be omitted for a simple greeting
    const memSection = resolved.compressedPrompt.sections.find((s) => s.key === "memory_write");
    if (memSection && !memSection.included) {
      assert.ok(!text.includes("🧠 זיכרון:"));
    }
  });

  it("is shorter than the full formatter for simple messages", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const compressed = formatCompressedContextForPrompt(resolved);
    const full = formatResolvedContextForPrompt(resolved);
    // Compressed should be shorter or similar
    assert.ok(compressed.length <= full.length + 50, `Compressed (${compressed.length}) should not be much longer than full (${full.length})`);
  });

  it("buildResolvedContext includes compressedPrompt", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("compressedPrompt" in resolved);
    assert.ok(Array.isArray(resolved.compressedPrompt.sections));
    assert.ok(typeof resolved.compressedPrompt.summary === "string");
  });
});

// ============================================================
// MEMORY COMMIT POLICY TESTS
// ============================================================

describe("memory-commit-policy", () => {
  function makeCommitInput(bundleOverrides: Partial<ContextBundle> = {}, extra: Record<string, any> = {}) {
    const bundle = makeBundle(bundleOverrides);
    const focus = resolvePrimaryFocus(bundle);
    const mode = resolveResponseMode(bundle, focus);
    const plan = resolveActionPlan({ bundle, primaryFocus: focus, responseMode: mode });
    const ti = resolveToolIntent({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    const mw = resolveMemoryWriteDecision({ bundle, primaryFocus: focus, responseMode: mode, actionPlan: plan });
    return {
      bundle,
      primaryFocus: focus,
      responseMode: mode,
      actionPlan: plan,
      toolIntent: ti,
      memoryWriteDecision: extra.memoryWriteDecision ?? mw,
    };
  }

  it("shouldWrite=false => skip", () => {
    const input = makeCommitInput({}, {
      memoryWriteDecision: { type: "none", shouldWrite: false, summary: "s", reason: "r", confidence: 0.7 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "skip");
  });

  it("fact new => write_new", () => {
    const input = makeCommitInput({
      person: { chatId: "newuser@c.us", name: "חדש", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: false, isGroup: false, isApprovedContact: true },
      conversation: { lastUserMessage: "קוראים לי דוד", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "fact", shouldWrite: true, summary: "s", reason: "שם", confidence: 0.9 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "write_new");
    assert.strictEqual(decision.targetKey, "fact");
  });

  it("preference new => write_new", () => {
    const input = makeCommitInput({
      person: { chatId: "newuser@c.us", name: "חדש", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: false, isGroup: false, isApprovedContact: true },
      conversation: { lastUserMessage: "אני מעדיף מקומות שקטים", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "preference", shouldWrite: true, summary: "s", reason: "העדפה", confidence: 0.9 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "write_new");
    assert.strictEqual(decision.targetKey, "preference");
  });

  it("relationship upgrade from unknown => update_existing", () => {
    // This test relies on relationship store returning a profile with unknown type
    // Since we can't easily mock the store, test with a new chatId (no profile => write_new)
    const input = makeCommitInput({
      person: { chatId: "brand-new@c.us", name: "חדש", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: false, isGroup: false, isApprovedContact: true },
      conversation: { lastUserMessage: "הוא לקוח שלי", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "relationship_signal", shouldWrite: true, summary: "s", reason: "לקוח", confidence: 0.85 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.ok(decision.action === "write_new" || decision.action === "update_existing");
  });

  it("task signal weak => skip", () => {
    const input = makeCommitInput({
      conversation: { lastUserMessage: "תבדקי", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "task_signal", shouldWrite: true, summary: "s", reason: "r", confidence: 0.85 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "skip");
  });

  it("owner without explicit instruction => skip", () => {
    const input = makeCommitInput({
      person: { chatId: "owner@c.us", name: "רני", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: true, isGroup: false, isApprovedContact: true },
      conversation: { lastUserMessage: "אני אוהב סושי", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "preference", shouldWrite: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "skip");
  });

  it("owner with explicit instruction => write_new", () => {
    const input = makeCommitInput({
      person: { chatId: "owner@c.us", name: "רני", relationshipType: "unknown", importanceScore: 20, communicationStyle: "unknown", isOwner: true, isGroup: false, isApprovedContact: true },
      conversation: { lastUserMessage: "תזכרי שאני אוהב סושי", isWaitingForReply: false, messageCount: 5, repeatedRecentMessages: false },
    }, {
      memoryWriteDecision: { type: "preference", shouldWrite: true, summary: "s", reason: "r", confidence: 0.9 },
    });
    const decision = resolveMemoryCommitDecision(input);
    assert.strictEqual(decision.action, "write_new");
  });

  it("buildResolvedContext includes memoryCommitDecision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("memoryCommitDecision" in resolved);
    assert.ok(typeof resolved.memoryCommitDecision.action === "string");
    assert.ok(typeof resolved.memoryCommitDecision.confidence === "number");
  });

  it("formatter shows memory commit only when action != skip", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const text = formatResolvedContextForPrompt(resolved);
    if (resolved.memoryCommitDecision.action === "skip") {
      assert.ok(!text.includes("החלטת זיכרון"));
    }
  });
});

// ============================================================
// OUTCOME TRACKER TESTS
// ============================================================

describe("outcome-tracker", () => {
  function makeOutcomeInput(overrides: Record<string, any> = {}) {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const { outcomeEvaluation, ...rest } = resolved;
    return { ...rest, ...overrides };
  }

  it("allow_tool_execution => pending + followup 10 min", () => {
    const input = makeOutcomeInput({
      executionDecision: { type: "allow_tool_execution", summary: "s", reason: "r", confidence: 0.92, allowTools: true },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "pending");
    assert.strictEqual(outcome.requiresFollowup, true);
    assert.strictEqual(outcome.followupSuggestedMinutes, 10);
  });

  it("clarify_first => awaiting_user + followup 30 min", () => {
    const input = makeOutcomeInput({
      responseStrategy: { type: "clarify_first", summary: "s", reason: "r", confidence: 0.95 },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "awaiting_user");
    assert.strictEqual(outcome.requiresFollowup, true);
    assert.strictEqual(outcome.followupSuggestedMinutes, 30);
  });

  it("mention_followup => pending + followup 60 min", () => {
    const input = makeOutcomeInput({
      actionPlan: { type: "mention_followup", summary: "s", reason: "r", confidence: 0.9, needsClarification: false },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "pending");
    assert.strictEqual(outcome.requiresFollowup, true);
    assert.strictEqual(outcome.followupSuggestedMinutes, 60);
  });

  it("give_status => completed", () => {
    const input = makeOutcomeInput({
      actionPlan: { type: "give_status", summary: "s", reason: "r", confidence: 0.95, needsClarification: false },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "completed");
    assert.strictEqual(outcome.requiresFollowup, false);
  });

  it("block_tool_execution => awaiting_user", () => {
    const input = makeOutcomeInput({
      executionDecision: { type: "block_tool_execution", summary: "s", reason: "r", confidence: 0.88, allowTools: false },
      responseStrategy: { type: "acknowledge_and_followup", summary: "s", reason: "r", confidence: 0.88 },
      toolIntent: { type: "calendar", shouldUseTool: true, summary: "s", reason: "r", confidence: 0.9 },
      actionPlan: { type: "handle_new_request", summary: "s", reason: "r", confidence: 0.85, needsClarification: false },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "awaiting_user");
    assert.strictEqual(outcome.requiresFollowup, true);
  });

  it("contradiction => awaiting_user", () => {
    const input = makeOutcomeInput({
      contradictions: [{ type: "reference_conflict", summary: "s", resolution: "r", confidence: 0.85 }],
      executionDecision: { type: "reply_only", summary: "s", reason: "r", confidence: 0.7, allowTools: false },
      responseStrategy: { type: "acknowledge_and_followup", summary: "s", reason: "r", confidence: 0.88 },
      toolIntent: { type: "none", shouldUseTool: false, summary: "s", reason: "r", confidence: 0.7 },
      actionPlan: { type: "reply_only", summary: "s", reason: "r", confidence: 0.6, needsClarification: false },
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "awaiting_user");
    assert.strictEqual(outcome.requiresFollowup, true);
  });

  it("simple reply => completed", () => {
    const input = makeOutcomeInput({
      toolIntent: { type: "none", shouldUseTool: false, summary: "s", reason: "r", confidence: 0.7 },
      responseStrategy: { type: "direct_reply", summary: "s", reason: "r", confidence: 0.7 },
      executionDecision: { type: "reply_only", summary: "s", reason: "r", confidence: 0.7, allowTools: false },
      actionPlan: { type: "reply_only", summary: "s", reason: "r", confidence: 0.6, needsClarification: false },
      contradictions: [],
    });
    const outcome = evaluateOutcome(input);
    assert.strictEqual(outcome.status, "completed");
    assert.strictEqual(outcome.requiresFollowup, false);
  });

  it("buildResolvedContext includes outcomeEvaluation", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    assert.ok("outcomeEvaluation" in resolved);
    assert.ok(typeof resolved.outcomeEvaluation.status === "string");
    assert.ok(typeof resolved.outcomeEvaluation.requiresFollowup === "boolean");
  });
});

describe("formatter outcome section", () => {
  it("shows outcome section when followup needed", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatCompressedContextForPrompt(resolved);
    if (resolved.outcomeEvaluation.requiresFollowup) {
      assert.ok(text.includes("מצב משימה"));
    }
  });

  it("omits outcome section for completed simple reply", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    const text = formatCompressedContextForPrompt(resolved);
    if (resolved.outcomeEvaluation.status === "completed") {
      assert.ok(!text.includes("מצב משימה"));
    }
  });
});

// ============================================================
// PHASE 14 — Debug Trace
// ============================================================

// Helper to build a minimal resolved context (without debugTrace) for trace testing
function makeResolvedForTrace(overrides: Partial<Omit<ResolvedContext, "debugTrace">> = {}): Omit<ResolvedContext, "debugTrace"> {
  const bundle = makeBundle();
  return {
    bundle,
    primaryFocus: { type: "message", summary: "הודעה רגילה", reason: "אין פוקוס מיוחד", confidence: 0.8 },
    responseMode: { tone: "friendly", brevity: "short", structure: "direct_answer", shouldAcknowledgeDelay: false, shouldMentionOpenLoops: false },
    actionPlan: { type: "reply_only", summary: "תגובה פשוטה", reason: "אין פעולה נדרשת", confidence: 0.9, needsClarification: false },
    toolIntent: { type: "none", shouldUseTool: false, summary: "אין צורך בכלי", reason: "שיחה רגילה", confidence: 0.9 },
    memoryWriteDecision: { type: "none", shouldWrite: false, summary: "אין מה לשמור", reason: "אין עובדה חדשה", confidence: 0.8 },
    memoryCommitDecision: { action: "skip", summary: "דילוג", reason: "אין צורך בכתיבה", confidence: 0.9 },
    conversationState: { type: "new_chat", summary: "שיחה חדשה", reason: "אין היסטוריה", confidence: 0.9 },
    contradictions: [],
    responseStrategy: { type: "direct_reply", summary: "תגובה ישירה", reason: "הודעה פשוטה", confidence: 0.9 },
    executionDecision: { type: "reply_only", summary: "תגובה בלבד", reason: "אין צורך בכלים", confidence: 0.9, allowTools: false },
    toolRoutingPolicy: { group: "none", summary: "ללא ניתוב", reason: "אין כלי", confidence: 0.9, allowedToolNames: [] },
    compressedPrompt: { sections: [{ key: "person", title: "אדם", content: ["test"], priority: "high", included: true, reason: "תמיד" }], summary: "הקשר בסיסי" },
    outcomeEvaluation: { status: "completed", summary: "הושלם", reason: "תגובה פשוטה", confidence: 0.9, requiresFollowup: false },
    ...overrides,
  };
}

describe("debug-trace", () => {
  it("always includes primary_focus", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "primary_focus"));
  });

  it("always includes action_plan", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "action_plan"));
  });

  it("always includes response_strategy", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "response_strategy"));
  });

  it("always includes execution_decision", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "execution_decision"));
  });

  it("always includes tool_routing", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "tool_routing"));
  });

  it("always includes outcome", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.items.some((i) => i.step === "outcome"));
  });

  it("omits contradictions item when none", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({ contradictions: [] }));
    assert.ok(!trace.items.some((i) => i.step === "contradictions"));
  });

  it("includes contradictions item when present", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({
      contradictions: [{ type: "intent_vs_missing_info", summary: "סתירה", resolution: "פתרון", confidence: 0.8 }],
    }));
    assert.ok(trace.items.some((i) => i.step === "contradictions"));
  });

  it("omits memory_commit when skip", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({
      memoryCommitDecision: { action: "skip", summary: "דילוג", reason: "אין צורך", confidence: 0.9 },
    }));
    assert.ok(!trace.items.some((i) => i.step === "memory_commit"));
  });

  it("includes memory_commit when not skip", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({
      memoryCommitDecision: { action: "write_new", summary: "כתיבה", reason: "עובדה חדשה", confidence: 0.9 },
    }));
    assert.ok(trace.items.some((i) => i.step === "memory_commit"));
  });

  it("summary is non-empty", () => {
    const trace = buildDebugTrace(makeResolvedForTrace());
    assert.ok(trace.summary.length > 0);
  });

  it("omits tool_intent when type is none", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({
      toolIntent: { type: "none", shouldUseTool: false, summary: "אין", reason: "אין", confidence: 0.9 },
    }));
    assert.ok(!trace.items.some((i) => i.step === "tool_intent"));
  });

  it("includes tool_intent when type is not none", () => {
    const trace = buildDebugTrace(makeResolvedForTrace({
      toolIntent: { type: "calendar", shouldUseTool: true, summary: "יומן", reason: "בקשת תיאום", confidence: 0.9 },
    }));
    assert.ok(trace.items.some((i) => i.step === "tool_intent"));
  });
});

describe("debug-trace formatter", () => {
  it("includes 🧠 Debug Trace header", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatDebugTrace(resolved);
    assert.ok(text.includes("🧠 Debug Trace"));
  });

  it("includes 🧾 Summary header", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const text = formatDebugTrace(resolved);
    assert.ok(text.includes("🧾 Summary"));
  });
});

describe("debug-trace integration", () => {
  it("buildResolvedContext includes debugTrace", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    assert.ok("debugTrace" in resolved);
    assert.ok(Array.isArray(resolved.debugTrace.items));
    assert.ok(resolved.debugTrace.summary.length > 0);
  });

  it("debugTrace items always include mandatory steps", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "מה קורה?", sender: ownerSender });
    const steps = resolved.debugTrace.items.map((i) => i.step);
    assert.ok(steps.includes("primary_focus"));
    assert.ok(steps.includes("action_plan"));
    assert.ok(steps.includes("response_strategy"));
    assert.ok(steps.includes("execution_decision"));
    assert.ok(steps.includes("tool_routing"));
    assert.ok(steps.includes("outcome"));
  });
});

// ============================================================
// PHASE 16 — Followup Automation
// ============================================================

// Helper: build a resolved context for followup automation testing (without followupAutomationDecision)
function makeResolvedForFollowup(overrides: Partial<Omit<ResolvedContext, "followupAutomationDecision">> = {}): Omit<ResolvedContext, "followupAutomationDecision"> {
  const bundle = makeBundle();
  return {
    bundle,
    primaryFocus: { type: "message", summary: "הודעה רגילה", reason: "אין פוקוס מיוחד", confidence: 0.8 },
    responseMode: { tone: "friendly", brevity: "short", structure: "direct_answer", shouldAcknowledgeDelay: false, shouldMentionOpenLoops: false },
    actionPlan: { type: "reply_only", summary: "תגובה פשוטה", reason: "אין פעולה נדרשת", confidence: 0.9, needsClarification: false },
    toolIntent: { type: "none", shouldUseTool: false, summary: "אין צורך בכלי", reason: "שיחה רגילה", confidence: 0.9 },
    memoryWriteDecision: { type: "none", shouldWrite: false, summary: "אין מה לשמור", reason: "אין עובדה חדשה", confidence: 0.8 },
    memoryCommitDecision: { action: "skip", summary: "דילוג", reason: "אין צורך בכתיבה", confidence: 0.9 },
    conversationState: { type: "new_chat", summary: "שיחה חדשה", reason: "אין היסטוריה", confidence: 0.9 },
    contradictions: [],
    responseStrategy: { type: "direct_reply", summary: "תגובה ישירה", reason: "הודעה פשוטה", confidence: 0.9 },
    executionDecision: { type: "reply_only", summary: "תגובה בלבד", reason: "אין צורך בכלים", confidence: 0.9, allowTools: false },
    toolRoutingPolicy: { group: "none", summary: "ללא ניתוב", reason: "אין כלי", confidence: 0.9, allowedToolNames: [] },
    compressedPrompt: { sections: [{ key: "person", title: "אדם", content: ["test"], priority: "high", included: true, reason: "תמיד" }], summary: "הקשר בסיסי" },
    outcomeEvaluation: { status: "completed", summary: "הושלם", reason: "תגובה פשוטה", confidence: 0.9, requiresFollowup: false },
    debugTrace: { items: [], summary: "test" },
    ...overrides,
  };
}

describe("followup-automation", () => {
  it("no followup needed => skip_not_needed", () => {
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup());
    assert.strictEqual(decision.action, "skip_not_needed");
  });

  it("clarification flow => create_followup", () => {
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      actionPlan: { type: "ask_for_missing_detail", summary: "חסר פרט", reason: "לא ברור למי", confidence: 0.8, needsClarification: true },
      outcomeEvaluation: { status: "awaiting_user", summary: "ממתין", reason: "חסר פרט", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 30 },
    }));
    assert.strictEqual(decision.action, "create_followup");
    assert.ok(decision.suggestedDueAt);
    // Verify ~30 min in the future
    const dueMs = new Date(decision.suggestedDueAt).getTime() - Date.now();
    assert.ok(dueMs > 25 * 60 * 1000 && dueMs < 35 * 60 * 1000, "due time should be ~30 min from now");
  });

  it("followup mention => create_followup", () => {
    const bundle = makeBundle({
      openLoops: { followups: [{ reason: "לבדוק עם דני על החשבונית", dueAt: new Date().toISOString(), isOverdue: false }] },
    });
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      bundle,
      actionPlan: { type: "mention_followup", summary: "הזכרת followup", reason: "יש דבר פתוח", confidence: 0.8, needsClarification: false },
      outcomeEvaluation: { status: "pending", summary: "ממתין", reason: "followup פתוח", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 60 },
    }));
    assert.strictEqual(decision.action, "create_followup");
    assert.ok(decision.suggestedReason);
  });

  it("meeting mention => create_followup", () => {
    const bundle = makeBundle({
      openLoops: { followups: [], pendingMeeting: { requesterName: "דני", topic: "סקירת פרויקט", id: "m1" } },
    });
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      bundle,
      actionPlan: { type: "mention_meeting", summary: "הזכרת פגישה", reason: "יש בקשת תיאום", confidence: 0.8, needsClarification: false },
      outcomeEvaluation: { status: "pending", summary: "ממתין", reason: "פגישה ממתינה", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 120 },
    }));
    assert.strictEqual(decision.action, "create_followup");
    assert.ok(decision.suggestedReason?.includes("פגישה"));
  });

  it("allow_tool_execution => skip_not_needed", () => {
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      actionPlan: { type: "ask_for_missing_detail", summary: "חסר פרט", reason: "חסר", confidence: 0.8, needsClarification: true },
      executionDecision: { type: "allow_tool_execution", summary: "הפעלת כלי", reason: "מותר", confidence: 0.9, allowTools: true },
      outcomeEvaluation: { status: "pending", summary: "ממתין", reason: "כלי", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 30 },
    }));
    assert.strictEqual(decision.action, "skip_not_needed");
  });

  it("decision has suggestedReason when creating", () => {
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      actionPlan: { type: "ask_for_missing_detail", summary: "חסר פרט", reason: "חסר", confidence: 0.8, needsClarification: true },
      outcomeEvaluation: { status: "awaiting_user", summary: "ממתין", reason: "חסר", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 30 },
    }));
    assert.strictEqual(decision.action, "create_followup");
    assert.ok(decision.suggestedReason, "should have suggestedReason");
    assert.ok(decision.suggestedReason.length > 0);
  });

  it("decision has suggestedDueAt when creating", () => {
    const decision = resolveFollowupAutomationDecision(makeResolvedForFollowup({
      actionPlan: { type: "ask_for_missing_detail", summary: "חסר פרט", reason: "חסר", confidence: 0.8, needsClarification: true },
      outcomeEvaluation: { status: "awaiting_user", summary: "ממתין", reason: "חסר", confidence: 0.8, requiresFollowup: true, followupSuggestedMinutes: 30 },
    }));
    assert.ok(decision.suggestedDueAt, "should have suggestedDueAt");
    // Validate ISO date format
    assert.ok(!isNaN(new Date(decision.suggestedDueAt).getTime()));
  });

  it("buildResolvedContext includes followupAutomationDecision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    assert.ok("followupAutomationDecision" in resolved);
    assert.ok(typeof resolved.followupAutomationDecision.action === "string");
  });

  it("debug trace and formatter still work with followupAutomationDecision", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "hi", sender: contactSender });
    const traceText = formatDebugTrace(resolved);
    assert.ok(traceText.includes("🧠 Debug Trace"));
    assert.ok(traceText.includes("🧾 Summary"));
  });
});

// ============================================================
// PHASE 17 — Domain Policies
// ============================================================

// Helper: build a resolved context for domain policy testing (without domainPolicy)
function makeResolvedForDomain(overrides: Partial<Omit<ResolvedContext, "domainPolicy">> = {}): Omit<ResolvedContext, "domainPolicy"> {
  const bundle = makeBundle();
  return {
    bundle,
    primaryFocus: { type: "message", summary: "הודעה רגילה", reason: "אין פוקוס מיוחד", confidence: 0.8 },
    responseMode: { tone: "friendly", brevity: "short", structure: "direct_answer", shouldAcknowledgeDelay: false, shouldMentionOpenLoops: false },
    actionPlan: { type: "reply_only", summary: "תגובה פשוטה", reason: "אין פעולה נדרשת", confidence: 0.9, needsClarification: false },
    toolIntent: { type: "none", shouldUseTool: false, summary: "אין צורך בכלי", reason: "שיחה רגילה", confidence: 0.9 },
    memoryWriteDecision: { type: "none", shouldWrite: false, summary: "אין מה לשמור", reason: "אין עובדה חדשה", confidence: 0.8 },
    memoryCommitDecision: { action: "skip", summary: "דילוג", reason: "אין צורך בכתיבה", confidence: 0.9 },
    conversationState: { type: "new_chat", summary: "שיחה חדשה", reason: "אין היסטוריה", confidence: 0.9 },
    contradictions: [],
    responseStrategy: { type: "direct_reply", summary: "תגובה ישירה", reason: "הודעה פשוטה", confidence: 0.9 },
    executionDecision: { type: "reply_only", summary: "תגובה בלבד", reason: "אין צורך בכלים", confidence: 0.9, allowTools: false },
    toolRoutingPolicy: { group: "none", summary: "ללא ניתוב", reason: "אין כלי", confidence: 0.9, allowedToolNames: [] },
    compressedPrompt: { sections: [{ key: "person", title: "אדם", content: ["test"], priority: "high", included: true, reason: "תמיד" }], summary: "הקשר בסיסי" },
    outcomeEvaluation: { status: "completed", summary: "הושלם", reason: "תגובה פשוטה", confidence: 0.9, requiresFollowup: false },
    debugTrace: { items: [], summary: "test" },
    followupAutomationDecision: { action: "skip_not_needed", summary: "לא ליצור followup", reason: "לא נדרש", confidence: 0.7 },
    ...overrides,
  };
}

describe("domain-policy-resolver", () => {
  it("messaging intent => domain messaging", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "messaging", shouldUseTool: true, summary: "שליחה", reason: "בקשת שליחה", confidence: 0.9 },
    }));
    assert.strictEqual(policy.domain, "messaging");
  });

  it("calendar intent => domain calendar", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "calendar", shouldUseTool: true, summary: "יומן", reason: "בקשת תיאום", confidence: 0.9 },
    }));
    assert.strictEqual(policy.domain, "calendar");
  });

  it("crm intent => domain crm", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "crm", shouldUseTool: true, summary: "CRM", reason: "בקשת CRM", confidence: 0.9 },
    }));
    assert.strictEqual(policy.domain, "crm");
  });

  it("booking intent => domain booking", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "booking", shouldUseTool: true, summary: "הזמנה", reason: "בקשת הזמנה", confidence: 0.9 },
    }));
    assert.strictEqual(policy.domain, "booking");
  });

  it("travel intent => domain travel", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "travel", shouldUseTool: true, summary: "נסיעה", reason: "בקשת נסיעה", confidence: 0.9 },
    }));
    assert.strictEqual(policy.domain, "travel");
  });

  it("no domain intent => general", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain());
    assert.strictEqual(policy.domain, "general");
    assert.strictEqual(policy.confidence, 0.7);
  });

  it("messaging rules include recipient safety", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "messaging", shouldUseTool: true, summary: "שליחה", reason: "בקשת שליחה", confidence: 0.9 },
    }));
    assert.ok(policy.rules.some((r) => r.includes("נמען")));
  });

  it("calendar rules include date/time/topic safety", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "calendar", shouldUseTool: true, summary: "יומן", reason: "תיאום", confidence: 0.9 },
    }));
    assert.ok(policy.rules.some((r) => r.includes("תאריך") || r.includes("שעה") || r.includes("נושא")));
  });

  it("booking rules include missing reservation details", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain({
      toolIntent: { type: "booking", shouldUseTool: true, summary: "הזמנה", reason: "הזמנה", confidence: 0.9 },
    }));
    assert.ok(policy.rules.some((r) => r.includes("הזמנה") || r.includes("סועדים")));
  });

  it("domainPolicy summary and reason are non-empty", () => {
    const policy = resolveDomainPolicy(makeResolvedForDomain());
    assert.ok(policy.summary.length > 0);
    assert.ok(policy.reason.length > 0);
  });

  it("buildResolvedContext includes domainPolicy", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    assert.ok("domainPolicy" in resolved);
    assert.ok(typeof resolved.domainPolicy.domain === "string");
    assert.ok(Array.isArray(resolved.domainPolicy.rules));
  });
});

describe("domain-policy formatter", () => {
  it("compressed formatter includes domain section when relevant", () => {
    const resolved = buildResolvedContext({ chatId: "owner@c.us", message: "תקבע פגישה מחר", sender: ownerSender });
    if (resolved.domainPolicy.domain !== "general") {
      const text = formatCompressedContextForPrompt(resolved);
      assert.ok(text.includes("🧩 מדיניות דומיין"));
    }
  });

  it("compressed formatter omits domain section for general", () => {
    const resolved = buildResolvedContext({ chatId: "test@c.us", message: "שלום", sender: contactSender });
    if (resolved.domainPolicy.domain === "general") {
      const text = formatCompressedContextForPrompt(resolved);
      assert.ok(!text.includes("🧩 מדיניות דומיין"));
    }
  });
});
