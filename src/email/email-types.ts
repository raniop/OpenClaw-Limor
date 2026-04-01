/**
 * Email Types — shared interfaces for iCloud email integration.
 */

export interface ParsedEmail {
  uid: number;
  messageId: string; // Message-ID header (unique per email)
  from: string; // Display name + email
  fromAddress: string; // Just the email address
  to: string;
  subject: string;
  date: string; // ISO timestamp
  textBody: string; // Plain text (truncated to 2000 chars)
  snippet: string; // First 200 chars
}

export type EmailOrderType = "package" | "flight" | "hotel" | "receipt";
export type EmailOrderStatus =
  | "detected"
  | "confirmed"
  | "delivered"
  | "completed"
  | "dismissed";

export interface EmailOrder {
  id: string; // Generated: "eord-{timestamp36}-{random}"
  emailUid: number;
  messageId: string; // For dedup
  type: EmailOrderType;
  status: EmailOrderStatus;
  from: string;
  subject: string;
  emailDate: string; // ISO
  // Extracted details
  vendor: string; // e.g., "Amazon", "אל על"
  orderNumber?: string;
  trackingNumber?: string;
  amount?: string; // "₪149.90" or "$29.99"
  // Flight-specific
  flightNumber?: string;
  route?: string; // "TLV → BCN"
  departureDate?: string;
  // Hotel-specific
  hotelName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  confirmationNumber?: string;
  // Cross-reference
  linkedDeliveryId?: string; // Links to DeliveryEntry.id from SMS
  // Metadata
  summary: string; // Hebrew one-liner for display
  createdAt: string;
  updatedAt?: string;
}

export interface EmailSearchQuery {
  keyword?: string;
  from?: string;
  since?: Date;
  before?: Date;
  limit?: number;
}

export interface EmailPollerState {
  lastSeenUid: number;
  lastPollAt: string;
  totalProcessed: number;
}
