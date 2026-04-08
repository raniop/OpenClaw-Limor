/**
 * Delivery Poller — periodically checks for new delivery SMS and alerts the owner.
 * Runs every 2 minutes, only alerts on new messages.
 */
import { isAvailable, getMessagesSince, getLatestMessageId } from "./sms-reader";
import { findDeliveryAlerts } from "./delivery-detector";
import { shouldForwardDelivery } from "../operational-rules";
import { addDelivery } from "./delivery-store";
import { findOrderByTracking, findOrderByVendor, linkOrderToDelivery } from "../email/email-order-store";

let lastCheckedId = 0;
let sendToOwner: ((text: string) => Promise<void>) | null = null;

/**
 * Start polling for delivery SMS. Call once at startup.
 */
export function startDeliveryPoller(
  notifyOwner: (text: string) => Promise<void>,
  intervalMs: number = 2 * 60 * 1000
): void {
  if (!isAvailable()) {
    console.log("[sms] Messages DB not available, delivery poller disabled");
    return;
  }

  sendToOwner = notifyOwner;
  lastCheckedId = getLatestMessageId();
  console.log(`[sms] Delivery poller started (checking every ${intervalMs / 1000}s, from ID ${lastCheckedId})`);

  setInterval(checkForDeliveries, intervalMs);
}

async function checkForDeliveries(): Promise<void> {
  if (!sendToOwner) return;

  try {
    const newMessages = getMessagesSince(lastCheckedId);
    if (newMessages.length === 0) return;

    // Update last checked ID
    const maxId = Math.max(...newMessages.map((m) => m.id));
    if (maxId > lastCheckedId) lastCheckedId = maxId;

    // Find delivery alerts
    const alerts = findDeliveryAlerts(newMessages);
    if (alerts.length === 0) return;

    // Save to store and alert owner (check operational rules first)
    for (const alert of alerts) {
      if (!shouldForwardDelivery(alert.carrier, alert.summary)) {
        console.log(`[sms] Delivery alert blocked by operational rule: ${alert.carrier}`);
        continue;
      }

      const saved = addDelivery(
        alert.message.id,
        alert.carrier,
        alert.summary,
        alert.message.text,
        alert.message.sender,
        alert.message.timestamp,
        alert.trackingNumber
      );
      if (!saved) continue; // duplicate

      // Cross-reference with email orders
      try {
        const emailOrder =
          (alert.trackingNumber && findOrderByTracking(alert.trackingNumber)) ||
          findOrderByVendor(alert.carrier);
        if (emailOrder) {
          linkOrderToDelivery(emailOrder.id, saved.id);
          saved.emailOrderId = emailOrder.id;
          console.log(`[sms] Linked delivery ${saved.id} to email order ${emailOrder.id}`);
        }
      } catch {
        // Non-critical, ignore cross-reference errors
      }

      const text = `📦 ${alert.summary}\n💬 ${alert.message.text.substring(0, 300)}`;
      try {
        await sendToOwner(text);
        console.log(`[sms] Delivery alert sent: ${alert.summary}`);
      } catch (err) {
        console.error("[sms] Failed to send delivery alert:", err);
      }
    }
  } catch (err) {
    console.error("[sms] Delivery poll error:", err);
  }
}
