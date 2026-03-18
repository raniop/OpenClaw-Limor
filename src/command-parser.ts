/**
 * Owner command parsing.
 * Pure functions — no side effects, no I/O.
 * Extracted from whatsapp.ts for testability.
 */

export type OwnerCommand =
  | { type: "approve_contact"; code: string }
  | { type: "reject_contact"; code: string }
  | { type: "approve_meeting"; id: string }
  | { type: "reject_meeting"; id: string }
  | { type: "bare_approve" }
  | null;

/**
 * Parse an owner message into a structured command, or null if not a command.
 */
export function parseOwnerCommand(body: string): OwnerCommand {
  const lower = body.toLowerCase().trim();

  // "אשר קשר CODE" / "אשר CODE" / "approve CODE"
  const contactApprove = lower.match(/^(?:אשר(?:\s+קשר)?|approve)\s+([A-Za-z0-9]{4,8})$/i);
  if (contactApprove) {
    return { type: "approve_contact", code: contactApprove[1].toUpperCase() };
  }

  // "דחה קשר CODE" / "דחה CODE" / "reject CODE"
  const contactReject = lower.match(/^(?:דחה(?:\s+קשר)?|reject)\s+([A-Za-z0-9]{4,8})$/i);
  if (contactReject) {
    return { type: "reject_contact", code: contactReject[1].toUpperCase() };
  }

  // "אשר פגישה MXXXXX" / "approve meeting MXXXXX"
  const meetingApprove = lower.match(/^(?:אשר(?:\s+פגישה)?)\s+(M[A-Za-z0-9]{4,7})$/i);
  if (meetingApprove) {
    return { type: "approve_meeting", id: meetingApprove[1].toUpperCase() };
  }

  // "דחה פגישה MXXXXX"
  const meetingReject = lower.match(/^(?:דחה(?:\s+פגישה)?)\s+(M[A-Za-z0-9]{4,7})$/i);
  if (meetingReject) {
    return { type: "reject_meeting", id: meetingReject[1].toUpperCase() };
  }

  // Bare approval words: "כן", "אשר", "yes", "approve", "אישור"
  const bareApproveWords = ["כן", "אשר", "yes", "approve", "אישור"];
  if (bareApproveWords.includes(lower)) {
    return { type: "bare_approve" };
  }

  return null;
}
