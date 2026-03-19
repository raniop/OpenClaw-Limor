/**
 * Follow-up entry type definitions.
 */
export interface FollowupEntry {
  id: string;
  chatId: string;
  contactName: string;
  reason: string;
  dueAt: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  status: "pending" | "completed";
  requesterChatId?: string; // chatId of person who requested (for auto-notify on complete)
  requesterName?: string;   // name of requester
}
