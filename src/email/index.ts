// Email module — iCloud IMAP integration for reading emails and detecting orders
export {
  connectImap,
  disconnectImap,
  isImapConnected,
  isImapConfigured,
  fetchEmailsSinceUid,
  searchEmails,
  fetchRecentEmails,
} from "./imap-client";

export {
  detectEmailOrder,
  classifyEmailType,
} from "./order-detector";

export {
  addEmailOrder,
  getEmailOrders,
  updateOrderStatus,
  getPendingOrders,
  findOrderByTracking,
  findOrderByVendor,
  linkOrderToDelivery,
} from "./email-order-store";

export {
  startEmailPoller,
  stopEmailPoller,
} from "./email-poller";

export type {
  ParsedEmail,
  EmailOrder,
  EmailOrderType,
  EmailOrderStatus,
  EmailSearchQuery,
  EmailPollerState,
} from "./email-types";
