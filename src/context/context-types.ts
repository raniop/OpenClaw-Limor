/**
 * Context Engine types — structured context for every AI interaction.
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

export interface ContextBundle {
  person: PersonContext;
  conversation: ConversationContext;
  urgency: UrgencyContext;
  historySummary: string;
  system: SystemContext;
  signals: string[];
}
