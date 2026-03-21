/**
 * Storage abstraction interfaces.
 * Current implementation: file-based JSON.
 * Future: SQLite, Postgres, etc. — implement these interfaces and swap.
 */

// --- Approval / Pending Contacts ---

export interface PendingEntry {
  chatId: string;
  phone: string;
  createdAt: string;
}

export interface PendingEntryWithCode extends PendingEntry {
  code: string;
}

export interface IApprovalStore {
  isApproved(chatId: string): boolean;
  addApproved(chatId: string): void;
  removeApproved(chatId: string): boolean;

  isPending(chatId: string): boolean;
  addPending(chatId: string, phone: string): string; // returns code
  approveByCode(code: string): PendingEntry | null;
  rejectByCode(code: string): PendingEntry | null;
  getLastPending(): PendingEntryWithCode | null;
  getPendingCount(): number;
}

// --- Meeting Requests (v2 — delegates to meetings/meeting-state.ts) ---

export type { MeetingRequest as MeetingRequestV2 } from "../meetings/meeting-state";

/**
 * Legacy meeting request shape for backward compatibility.
 */
export interface MeetingRequest {
  requesterChatId: string;
  requesterName: string;
  topic: string;
  preferredTime?: string;
  createdAt: string;
}

export interface MeetingRequestWithId extends MeetingRequest {
  id: string;
}

/**
 * Meeting store interface v2.
 * Backed by the state machine in meetings/meeting-state.ts.
 */
export interface IMeetingStore {
  hasPendingRequest(requesterChatId: string): boolean;
  createRequest(chatId: string, contactName: string, topic: string, preferredTime?: string): Promise<{ id: string; alreadyPending: boolean }>;
  approve(id: string, date?: string, time?: string): Promise<{ success: boolean; error?: string; needsDateTime?: boolean }>;
  reject(id: string, reason?: string): Promise<{ success: boolean; error?: string }>;
  getMeetingById(id: string): MeetingRequestWithId | null;
  getLastMeetingRequest(): MeetingRequestWithId | null;
  getMeetingRequestCount(): number;
}

/** @deprecated Use IMeetingStore */
export type IMeetingRequestStore = IMeetingStore;

// --- Conversations ---

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
}

export interface IConversationStore {
  addMessage(chatId: string, role: "user" | "assistant", content: string): void;
  getHistory(chatId: string): ConversationMessage[];
  clearHistory(chatId: string): void;
  getSummary(chatId: string): string;
}
