/**
 * Context builder v2 — assembles a ContextBundle from existing stores.
 * Now includes open loop resolution, turn intent, and response guidance.
 * Deterministic, no AI calls, fast.
 */
import type { ContextBundle, PersonContext, ConversationContext, UrgencyContext, SystemContext, OpenLoopContext, ResolvedContext, MoodContext } from "./context-types";
import { getProfile } from "../relationship-memory/relationship-store";
import { conversationStore, approvalStore } from "../stores";
import { getPendingMeetingCount, getLastMeetingRequest } from "../meetings";
import { getPendingFollowups, getDueFollowups } from "../followups";
import { listPending as listPendingCapabilities } from "../capabilities/spec-store";
import { resolveOpenLoops } from "./open-loop-resolver";
import { classifyTurnIntent } from "./turn-intent";
import { generateResponseGuidance } from "./response-guidance";
import { resolvePrimaryFocus } from "./primary-focus";
import { resolveResponseMode } from "./response-mode";
import { resolveActionPlan } from "./action-plan";
import { resolveReferences } from "./reference-resolver";
import { resolveMissingInfo } from "./missing-info-resolver";
import { resolveToolIntent } from "./tool-intent-resolver";
import { resolveMemoryWriteDecision } from "./memory-write-decider";
import { resolveConversationState } from "./conversation-state-resolver";
import { resolveContradictions } from "./contradiction-resolver";
import { resolveResponseStrategy } from "./response-strategy-resolver";
import { resolveExecutionDecision } from "./execution-guardrails";
import { resolveToolRoutingPolicy } from "./tool-routing-policy";
import { buildCompressedPrompt } from "./prompt-compressor";
import { resolveMemoryCommitDecision } from "./memory-commit-policy";
import { evaluateOutcome } from "./outcome-tracker";
import { buildDebugTrace } from "./debug-trace";
import { resolveFollowupAutomationDecision } from "./followup-automation";
import { resolveDomainPolicy } from "./domain-policy-resolver";
import { detectMood } from "./mood-detector";

interface BuildParams {
  chatId: string;
  message: string;
  sender: {
    name: string;
    isOwner: boolean;
    isGroup: boolean;
  };
}

export function buildContext(params: BuildParams): ContextBundle {
  const person = buildPersonContext(params);
  const conversation = buildConversationContext(params);
  const urgency = buildUrgencyContext(params.chatId, person.importanceScore, conversation);
  const openLoops = resolveOpenLoops(params.chatId);
  const turnIntent = classifyTurnIntent(params.message);
  const references = resolveReferences(params.message, {
    mentionedEntities: turnIntent.mentionedEntities,
    openLoops,
    conversation,
    person,
  });
  const missingInfo = resolveMissingInfo(params.message, turnIntent, references);
  const mood = detectMood(params.message);
  const system = buildSystemContext();
  const signals = buildSignals(person, conversation, urgency, system);
  const historySummary = buildHistorySummary(person, conversation, urgency, openLoops);

  // Build partial bundle for guidance (needs all other fields)
  const partialBundle: ContextBundle = { person, conversation, urgency, openLoops, turnIntent, references, missingInfo, responseGuidance: [], historySummary, system, signals, mood };
  const responseGuidance = generateResponseGuidance(partialBundle);

  return { person, conversation, urgency, openLoops, turnIntent, references, missingInfo, responseGuidance, historySummary, system, signals, mood };
}

export function buildResolvedContext(params: BuildParams): ResolvedContext {
  const bundle = buildContext(params);
  const primaryFocus = resolvePrimaryFocus(bundle);
  const responseMode = resolveResponseMode(bundle, primaryFocus);
  const actionPlan = resolveActionPlan({ bundle, primaryFocus, responseMode });
  const partial = { bundle, primaryFocus, responseMode, actionPlan };
  const toolIntent = resolveToolIntent(partial);
  const memoryWriteDecision = resolveMemoryWriteDecision(partial);
  const memoryCommitDecision = resolveMemoryCommitDecision({ ...partial, toolIntent, memoryWriteDecision });
  const fullPartial = { ...partial, toolIntent, memoryWriteDecision, memoryCommitDecision };
  const conversationState = resolveConversationState(fullPartial);
  const contradictions = resolveContradictions(fullPartial);
  const responseStrategy = resolveResponseStrategy({ ...fullPartial, conversationState, contradictions });
  const executionDecision = resolveExecutionDecision({ ...fullPartial, conversationState, contradictions, responseStrategy });
  const toolRoutingPolicy = resolveToolRoutingPolicy({ ...fullPartial, conversationState, contradictions, responseStrategy, executionDecision });
  const compressedPrompt = buildCompressedPrompt({ bundle, primaryFocus, responseMode, actionPlan, toolIntent, memoryWriteDecision, memoryCommitDecision, conversationState, contradictions, responseStrategy, executionDecision, toolRoutingPolicy });
  const outcomeEvaluation = evaluateOutcome({ bundle, primaryFocus, responseMode, actionPlan, toolIntent, memoryWriteDecision, memoryCommitDecision, conversationState, contradictions, responseStrategy, executionDecision, toolRoutingPolicy, compressedPrompt });
  const preTrace = { bundle, primaryFocus, responseMode, actionPlan, toolIntent, memoryWriteDecision, memoryCommitDecision, conversationState, contradictions, responseStrategy, executionDecision, toolRoutingPolicy, compressedPrompt, outcomeEvaluation };
  const debugTrace = buildDebugTrace(preTrace);
  const preFollowup = { ...preTrace, debugTrace };
  const followupAutomationDecision = resolveFollowupAutomationDecision(preFollowup);
  const preDomain = { ...preFollowup, followupAutomationDecision };
  const domainPolicy = resolveDomainPolicy(preDomain);
  return { ...preDomain, domainPolicy };
}

function buildPersonContext(params: BuildParams): PersonContext {
  const profile = getProfile(params.chatId);
  const isApproved = approvalStore.isApproved(params.chatId);

  return {
    chatId: params.chatId,
    name: params.sender.name,
    relationshipType: profile?.relationshipType || "unknown",
    importanceScore: profile?.importanceScore || 20,
    communicationStyle: profile?.communicationStyle || "unknown",
    isOwner: params.sender.isOwner,
    isGroup: params.sender.isGroup,
    isApprovedContact: isApproved,
  };
}

function buildConversationContext(params: BuildParams): ConversationContext {
  const history = conversationStore.getHistory(params.chatId);
  const messageCount = history.length;

  // Find last assistant message
  let lastAssistantMessage: string | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      lastAssistantMessage = history[i].content;
      break;
    }
  }

  // Determine if waiting for reply: last message(s) are from user with no assistant response after
  const isWaitingForReply = history.length > 0 && history[history.length - 1].role === "user";

  // Detect repeated recent messages: 2+ consecutive user messages at the end without assistant response
  let consecutiveUserMessages = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") {
      consecutiveUserMessages++;
    } else {
      break;
    }
  }
  const repeatedRecentMessages = consecutiveUserMessages >= 2;

  // Last interaction timestamp from relationship profile
  const profile = getProfile(params.chatId);
  const lastInteractionAt = profile?.lastInteractionAt;

  return {
    lastUserMessage: params.message,
    lastAssistantMessage,
    isWaitingForReply,
    messageCount,
    repeatedRecentMessages,
    lastInteractionAt,
  };
}

function buildUrgencyContext(
  chatId: string,
  importanceScore: number,
  conversation: ConversationContext
): UrgencyContext {
  // Check followups for this chat
  const allPending = getPendingFollowups();
  const chatFollowups = allPending.filter((f) => f.chatId === chatId);
  const hasFollowup = chatFollowups.length > 0;

  const allOverdue = getDueFollowups();
  const chatOverdue = allOverdue.filter((f) => f.chatId === chatId);
  const isOverdue = chatOverdue.length > 0;

  // Compute waiting time from last interaction
  let waitingTimeMinutes = 0;
  if (conversation.lastInteractionAt) {
    waitingTimeMinutes = Math.round(
      (Date.now() - new Date(conversation.lastInteractionAt).getTime()) / (1000 * 60)
    );
  }

  // Base priority
  let priority: "low" | "medium" | "high" = "low";
  if (isOverdue) {
    priority = "high";
  } else if (hasFollowup) {
    priority = "medium";
  }

  // Boost: important contact waiting
  if (importanceScore > 70 && conversation.isWaitingForReply && priority === "low") {
    priority = "medium";
  }
  if (importanceScore > 70 && conversation.isWaitingForReply && priority === "medium") {
    priority = "high";
  }

  // Boost: repeated messages (user frustrated)
  if (conversation.repeatedRecentMessages && priority === "low") {
    priority = "medium";
  }

  return { hasFollowup, isOverdue, waitingTimeMinutes, priority };
}

function buildSystemContext(): SystemContext {
  return {
    pendingApprovals: approvalStore.getPendingCount(),
    pendingMeetings: getPendingMeetingCount(),
    pendingFollowups: getPendingFollowups().length,
    pendingCapabilities: listPendingCapabilities().length,
  };
}

function buildSignals(
  person: PersonContext,
  conversation: ConversationContext,
  urgency: UrgencyContext,
  system: SystemContext
): string[] {
  const signals: string[] = [];

  if (person.isOwner) signals.push("owner_message");
  if (person.isGroup) signals.push("group_message");
  if (person.isApprovedContact) signals.push("approved_contact");
  if (person.importanceScore >= 70) signals.push("important_contact");

  if (conversation.isWaitingForReply) signals.push("waiting_for_reply");
  if (conversation.repeatedRecentMessages) signals.push("repeated_messages");

  if (urgency.hasFollowup) signals.push("open_followup");
  if (urgency.isOverdue) signals.push("overdue_followup");

  if (system.pendingMeetings > 0) signals.push("pending_meeting_exists");
  if (system.pendingApprovals > 0) signals.push("pending_approvals_exist");

  return signals;
}

function buildHistorySummary(
  person: PersonContext,
  conversation: ConversationContext,
  urgency: UrgencyContext,
  openLoops: OpenLoopContext
): string {
  const parts: string[] = [];

  // Relationship context
  const TYPE_NAMES: Record<string, string> = {
    unknown: "", client: "לקוח", lead: "ליד", friend: "חבר",
    family: "משפחה", work: "עבודה", service: "שירות",
  };
  const typeName = TYPE_NAMES[person.relationshipType];
  if (typeName) {
    parts.push(`מדובר ב${typeName}`);
  }

  // Open loop content (v2 — actual task descriptions)
  if (openLoops.followups.length > 0) {
    const overdueItems = openLoops.followups.filter((f) => f.isOverdue);
    if (overdueItems.length > 0) {
      const desc = overdueItems[0].reason.substring(0, 60);
      parts.push(`יש משימה דחופה שעבר הזמן שלה: "${desc}"`);
    } else {
      const desc = openLoops.followups[0].reason.substring(0, 60);
      parts.push(`יש דבר פתוח: "${desc}"`);
    }
  } else if (urgency.isOverdue) {
    parts.push("יש followup שעבר הזמן שלו — דחוף לטפל");
  } else if (urgency.hasFollowup) {
    parts.push("יש followup פתוח");
  }

  // Repeated messages
  if (conversation.repeatedRecentMessages) {
    parts.push("המשתמש שלח מספר הודעות בלי מענה — חשוב לתת תשובה ממוקדת");
  } else if (conversation.isWaitingForReply) {
    parts.push("המשתמש מחכה לתשובה");
  }

  // Waiting time
  if (urgency.waitingTimeMinutes > 60) {
    const hours = Math.round(urgency.waitingTimeMinutes / 60);
    parts.push(`לא היה מענה כבר ${hours} שעות`);
  }

  // Owner context
  if (person.isOwner) {
    parts.push("זה רני (הבעלים)");
  }

  // Group context
  if (person.isGroup) {
    parts.push("זו שיחה בקבוצה");
  }

  if (parts.length === 0) {
    return "שיחה רגילה ללא דחיפות מיוחדת.";
  }

  return parts.join(". ") + ".";
}
