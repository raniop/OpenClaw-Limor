/**
 * Context Engine v2 types — structured context for every AI interaction.
 */

export interface PersonContext {
  chatId: string;
  name: string;
  relationshipType: string;
  importanceScore: number;
  communicationStyle: string;
  isOwner: boolean;
  isGroup: boolean;
  isApprovedContact: boolean;
}

export interface ConversationContext {
  lastUserMessage: string;
  lastAssistantMessage?: string;
  isWaitingForReply: boolean;
  messageCount: number;
  repeatedRecentMessages: boolean;
  lastInteractionAt?: string;
}

export interface UrgencyContext {
  hasFollowup: boolean;
  isOverdue: boolean;
  waitingTimeMinutes: number;
  priority: "low" | "medium" | "high";
}

export interface SystemContext {
  pendingApprovals: number;
  pendingMeetings: number;
  pendingFollowups: number;
  pendingCapabilities: number;
}

// --- v2 additions ---

export interface OpenLoopContext {
  /** Active followups for this chat with full content */
  followups: Array<{
    reason: string;
    dueAt: string;
    isOverdue: boolean;
    requesterName?: string;
  }>;
  /** Active meeting request from this chat if any */
  pendingMeeting?: {
    requesterName: string;
    topic: string;
    id: string;
  };
  /** Last assistant message for conversational continuity */
  lastAssistantMessage?: string;
}

export type TurnIntentCategory =
  | "greeting"
  | "question"
  | "followup_query"
  | "reminder_request"
  | "action_request"
  | "multi_step_request"
  | "status_query"
  | "correction"
  | "continuation"
  | "unclear";

export interface TurnIntent {
  category: TurnIntentCategory;
  confidence: number;
  /** Contact names/entities mentioned in the message */
  mentionedEntities: string[];
  /** Is this a one-word/minimal message like "?" or "כן"? */
  isMinimal: boolean;
}

// --- v5 reference + missing info resolution ---

export interface ResolvedReference {
  kind: "person" | "followup" | "meeting" | "topic" | "preference" | "unknown";
  displayName: string;
  source: "mentioned_entity" | "recent_contact" | "open_loop" | "last_assistant_message" | "topic_segment" | "memory" | "unknown";
  confidence: number;
}

export type MissingDetailType =
  | "recipient"
  | "subject"
  | "time"
  | "date"
  | "topic"
  | "target_object"
  | "none";

export interface MissingInfo {
  missing: MissingDetailType[];
  summary: string;
  confidence: number;
}

// --- Mood detection ---

export type UserMood =
  | "neutral"
  | "stressed"
  | "frustrated"
  | "happy"
  | "sad"
  | "rushed"
  | "excited";

export interface MoodContext {
  mood: UserMood;
  confidence: number;
  signals: string[];
}

export interface ContextBundle {
  person: PersonContext;
  conversation: ConversationContext;
  urgency: UrgencyContext;
  openLoops: OpenLoopContext;
  turnIntent: TurnIntent;
  references: ResolvedReference[];
  missingInfo: MissingInfo;
  responseGuidance: string[];
  historySummary: string;
  system: SystemContext;
  signals: string[];
  mood: MoodContext;
}

// --- v3 decision layer ---

export interface PrimaryFocus {
  type: "followup" | "meeting" | "approval" | "message" | "status" | "new_request";
  summary: string;
  reason: string;
  confidence: number;
}

export interface ResponseMode {
  tone: "friendly" | "direct" | "professional" | "warm";
  brevity: "short" | "medium";
  structure: "direct_answer" | "status_list" | "action_confirmation" | "clarify_and_act";
  register: "casual" | "professional" | "relaxed";
  shouldAcknowledgeDelay: boolean;
  shouldMentionOpenLoops: boolean;
}

// --- v4 action planner ---

export type PlannedActionType =
  | "reply_only"
  | "mention_followup"
  | "mention_meeting"
  | "give_status"
  | "confirm_correction"
  | "handle_new_request"
  | "handle_multi_step"
  | "ask_for_missing_detail";

export interface ActionPlan {
  type: PlannedActionType;
  summary: string;
  reason: string;
  confidence: number;
  needsClarification: boolean;
}

// --- v6 tool intent + memory write ---

export type ToolIntentType =
  | "none"
  | "messaging"
  | "calendar"
  | "booking"
  | "travel"
  | "crm"
  | "file"
  | "contact_lookup"
  | "capability"
  | "whatsapp_management";

export interface ToolIntent {
  type: ToolIntentType;
  shouldUseTool: boolean;
  summary: string;
  reason: string;
  confidence: number;
}

export type MemoryWriteType =
  | "none"
  | "fact"
  | "preference"
  | "relationship_signal"
  | "task_signal";

export interface MemoryWriteDecision {
  type: MemoryWriteType;
  shouldWrite: boolean;
  summary: string;
  reason: string;
  confidence: number;
}

// --- v7 conversation state + contradiction resolver ---

export type ConversationStateType =
  | "new_chat"
  | "active_exchange"
  | "awaiting_user_detail"
  | "awaiting_owner_approval"
  | "awaiting_followup"
  | "awaiting_meeting_response"
  | "status_discussion"
  | "correction_flow"
  | "action_execution";

export interface ConversationState {
  type: ConversationStateType;
  summary: string;
  reason: string;
  confidence: number;
}

export interface ContradictionFlag {
  type:
    | "intent_vs_missing_info"
    | "reply_vs_action"
    | "status_vs_new_request"
    | "reference_conflict"
    | "urgency_conflict"
    | "correction_override"
    | "none";
  summary: string;
  resolution: string;
  confidence: number;
}

// --- v8 response strategy ---

export type ResponseStrategyType =
  | "direct_reply"
  | "clarify_first"
  | "status_then_action"
  | "acknowledge_and_execute"
  | "acknowledge_and_followup"
  | "brief_answer"
  | "owner_summary";

export interface ResponseStrategy {
  type: ResponseStrategyType;
  summary: string;
  reason: string;
  confidence: number;
}

// --- v9 execution guardrails ---

export type ExecutionDecisionType =
  | "reply_only"
  | "clarify_before_execution"
  | "allow_tool_execution"
  | "block_tool_execution"
  | "safe_fallback_reply";

export interface ExecutionDecision {
  type: ExecutionDecisionType;
  summary: string;
  reason: string;
  confidence: number;
  allowTools: boolean;
}

// --- v10 tool routing policy ---

export type ToolRouteGroup =
  | "none"
  | "messaging"
  | "calendar"
  | "booking"
  | "travel"
  | "crm"
  | "file"
  | "contact_lookup"
  | "capability"
  | "owner_safe_readonly";

export interface ToolRoutingPolicy {
  group: ToolRouteGroup;
  summary: string;
  reason: string;
  confidence: number;
  allowedToolNames: string[];
}

// --- v11 memory commit policy ---

export type MemoryCommitAction =
  | "write_new"
  | "update_existing"
  | "skip"
  | "reject_conflict";

export interface MemoryCommitDecision {
  action: MemoryCommitAction;
  summary: string;
  reason: string;
  confidence: number;
  targetKey?: string;
}

// --- v12 prompt compression ---

export type PromptPriorityLevel = "critical" | "high" | "medium" | "low";

export interface PromptSection {
  key:
    | "person"
    | "urgency"
    | "open_loops"
    | "references"
    | "missing_info"
    | "guidance"
    | "primary_focus"
    | "response_mode"
    | "action_plan"
    | "tool_intent"
    | "memory_write"
    | "conversation_state"
    | "contradictions"
    | "response_strategy"
    | "execution_decision"
    | "tool_routing"
    | "mood";
  title: string;
  content: string[];
  priority: PromptPriorityLevel;
  included: boolean;
  reason: string;
}

export interface CompressedPrompt {
  sections: PromptSection[];
  summary: string;
}

// --- v13 outcome tracker ---

export type OutcomeStatus =
  | "completed"
  | "pending"
  | "awaiting_user"
  | "failed"
  | "unknown";

export interface OutcomeEvaluation {
  status: OutcomeStatus;
  summary: string;
  reason: string;
  confidence: number;
  requiresFollowup: boolean;
  followupSuggestedMinutes?: number;
}

// --- v14 debug trace ---

export type DebugTraceStep =
  | "bundle"
  | "primary_focus"
  | "response_mode"
  | "action_plan"
  | "tool_intent"
  | "memory_write"
  | "memory_commit"
  | "conversation_state"
  | "contradictions"
  | "response_strategy"
  | "execution_decision"
  | "tool_routing"
  | "compressed_prompt"
  | "outcome";

export interface DebugTraceItem {
  step: DebugTraceStep;
  summary: string;
  reason: string;
}

export interface DebugTrace {
  items: DebugTraceItem[];
  summary: string;
}

// --- v16 followup automation ---

export type FollowupAutomationAction =
  | "create_followup"
  | "skip_existing"
  | "skip_not_needed";

export interface FollowupAutomationDecision {
  action: FollowupAutomationAction;
  summary: string;
  reason: string;
  confidence: number;
  suggestedDueAt?: string;
  suggestedReason?: string;
}

// --- v17 domain policies ---

export type DomainType =
  | "general"
  | "messaging"
  | "calendar"
  | "crm"
  | "booking"
  | "travel";

export interface DomainPolicy {
  domain: DomainType;
  summary: string;
  reason: string;
  confidence: number;
  rules: string[];
}

export interface ResolvedContext {
  bundle: ContextBundle;
  primaryFocus: PrimaryFocus;
  responseMode: ResponseMode;
  actionPlan: ActionPlan;
  toolIntent: ToolIntent;
  memoryWriteDecision: MemoryWriteDecision;
  memoryCommitDecision: MemoryCommitDecision;
  conversationState: ConversationState;
  contradictions: ContradictionFlag[];
  responseStrategy: ResponseStrategy;
  executionDecision: ExecutionDecision;
  toolRoutingPolicy: ToolRoutingPolicy;
  compressedPrompt: CompressedPrompt;
  outcomeEvaluation: OutcomeEvaluation;
  debugTrace: DebugTrace;
  followupAutomationDecision: FollowupAutomationDecision;
  domainPolicy: DomainPolicy;
}

// --- v15 replay runner ---

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
