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
}
