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

// --- Meeting Requests ---

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

export interface IMeetingRequestStore {
  hasPendingRequest(requesterChatId: string): boolean;
  addMeetingRequest(
    requesterChatId: string,
    requesterName: string,
    topic: string,
    preferredTime?: string
  ): string; // returns id
  getMeetingRequestById(id: string): MeetingRequestWithId | null;
  getLastMeetingRequest(): MeetingRequestWithId | null;
  getMeetingRequestCount(): number;
  removeMeetingRequest(id: string): MeetingRequest | null;
}

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
}
