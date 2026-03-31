/**
 * Operational Trace — מעקב תפעולי מלא לכל אינטראקציה.
 * נבנה מה-ResolvedContext ומתעדכן אחרי תשובת ה-AI.
 * כל הלוגיקה דטרמיניסטית — ללא קריאות AI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { statePath } from "../state-dir";
import type {
  ResolvedContext,
  TurnIntentCategory,
  ConversationStateType,
  UserMood,
  MissingDetailType,
  PlannedActionType,
  ToolIntentType,
  ExecutionDecisionType,
  MemoryWriteType,
  ResponseStrategyType,
  OutcomeStatus,
} from "../context/context-types";
import type { SelfCheckResult } from "./self-check";

// --- OperationalTrace interface ---

export interface OperationalTrace {
  // Input
  traceId: string;
  timestamp: string;
  chatId: string;
  contactName: string;
  isOwner: boolean;
  isGroup: boolean;
  userInput: string;

  // Context Engine Decisions (from ResolvedContext)
  interpretedIntent: TurnIntentCategory;
  conversationState: ConversationStateType;
  detectedMood: UserMood;
  moodConfidence: number;
  detectedMissingInfo: MissingDetailType[];
  contradictionFlags: string[];
  selectedFocus: string; // primaryFocus.type
  selectedResponseStrategy: ResponseStrategyType;

  // Action Decisions
  plannedAction: PlannedActionType;
  needsClarification: boolean;
  toolIntentType: ToolIntentType;
  shouldUseTool: boolean;
  executionDecision: ExecutionDecisionType;
  allowTools: boolean;
  memoryWriteDecision: MemoryWriteType;

  // Open Loops
  openLoopsBefore: number;
  openLoopsOverdue: number;

  // Execution Results (filled after AI response)
  toolsUsed: string[];
  toolsSucceeded: string[];
  toolsFailed: string[];
  responseLength: number;
  hadHallucination: boolean;

  // Post-Response Self-Check (filled after)
  selfCheck: SelfCheckResult;

  // Outcome
  outcomeStatus: OutcomeStatus;
  requiresFollowup: boolean;
  completionConfidence: number;

  // Timing
  totalDurationMs: number;
  aiDurationMs: number;
}

// --- Builder params ---

export interface BuildTraceParams {
  traceId: string;
  chatId: string;
  contactName: string;
  isOwner: boolean;
  isGroup: boolean;
  userInput: string;
}

/**
 * בונה trace תפעולי ראשוני מה-ResolvedContext.
 * השדות של execution results, self-check ו-timing יתמלאו אחר כך.
 */
export function buildOperationalTrace(
  resolvedCtx: ResolvedContext,
  params: BuildTraceParams
): OperationalTrace {
  const { bundle, primaryFocus, actionPlan, toolIntent, memoryWriteDecision,
    conversationState, contradictions, responseStrategy, executionDecision,
    outcomeEvaluation } = resolvedCtx;

  const followups = bundle.openLoops.followups;
  const overdueCount = followups.filter((f) => f.isOverdue).length;

  return {
    // Input
    traceId: params.traceId,
    timestamp: new Date().toISOString(),
    chatId: params.chatId,
    contactName: params.contactName,
    isOwner: params.isOwner,
    isGroup: params.isGroup,
    userInput: params.userInput,

    // Context Engine Decisions
    interpretedIntent: bundle.turnIntent.category,
    conversationState: conversationState.type,
    detectedMood: bundle.mood.mood,
    moodConfidence: bundle.mood.confidence,
    detectedMissingInfo: bundle.missingInfo.missing,
    contradictionFlags: contradictions.map((c) => c.type),
    selectedFocus: primaryFocus.type,
    selectedResponseStrategy: responseStrategy.type,

    // Action Decisions
    plannedAction: actionPlan.type,
    needsClarification: actionPlan.needsClarification,
    toolIntentType: toolIntent.type,
    shouldUseTool: toolIntent.shouldUseTool,
    executionDecision: executionDecision.type,
    allowTools: executionDecision.allowTools,
    memoryWriteDecision: memoryWriteDecision.type,

    // Open Loops
    openLoopsBefore: followups.length,
    openLoopsOverdue: overdueCount,

    // Execution Results — ימולאו אחר כך
    toolsUsed: [],
    toolsSucceeded: [],
    toolsFailed: [],
    responseLength: 0,
    hadHallucination: false,

    // Self-Check — ימולא אחר כך
    selfCheck: { flags: [], alertLevel: "ok", summary: "pending" },

    // Outcome
    outcomeStatus: outcomeEvaluation.status,
    requiresFollowup: outcomeEvaluation.requiresFollowup,
    completionConfidence: outcomeEvaluation.confidence,

    // Timing — ימולא אחר כך
    totalDurationMs: 0,
    aiDurationMs: 0,
  };
}

// --- Persistence: ring buffer (max 500) ---

const TRACE_FILE = "operational-traces.json";
const MAX_TRACES = 500;

interface TraceStore {
  traces: OperationalTrace[];
}

function loadTraceStore(): TraceStore {
  const filePath = statePath(TRACE_FILE);
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.traces)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error("[ops] Failed to load trace store:", err);
  }
  return { traces: [] };
}

export function getRecentTraces(limit: number = 500): OperationalTrace[] {
  return loadTraceStore().traces.slice(-limit);
}

export function saveOperationalTrace(trace: OperationalTrace): void {
  try {
    const store = loadTraceStore();
    store.traces.push(trace);

    // Ring buffer — שומר רק את ה-N האחרונים
    if (store.traces.length > MAX_TRACES) {
      store.traces = store.traces.slice(store.traces.length - MAX_TRACES);
    }

    const filePath = statePath(TRACE_FILE);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[ops] Failed to save trace:", err);
  }
}

/**
 * מחזיר סיכום קצר של ה-trace ללוג.
 */
export function formatTraceSummary(trace: OperationalTrace): string {
  const flags = trace.selfCheck.flags.length > 0
    ? ` | flags: ${trace.selfCheck.flags.join(", ")}`
    : "";
  const tools = trace.toolsUsed.length > 0
    ? ` | tools: ${trace.toolsUsed.join(", ")}`
    : "";
  return `[ops] ${trace.contactName} | intent=${trace.interpretedIntent} | action=${trace.plannedAction} | strategy=${trace.selectedResponseStrategy} | alert=${trace.selfCheck.alertLevel}${flags}${tools} | ${trace.totalDurationMs}ms`;
}
