/**
 * Email Handlers — tool implementations for email reading and order tracking.
 */
import type { ToolHandler } from "./types";
import {
  isImapConfigured,
  isImapConnected,
  connectImap,
  fetchRecentEmails,
  searchEmails,
} from "../../email/imap-client";
import { getEmailOrders } from "../../email/email-order-store";
import type { EmailOrderType, ParsedEmail, EmailOrder } from "../../email/email-types";

const TYPE_EMOJIS: Record<string, string> = {
  package: "📦",
  flight: "✈️",
  hotel: "🏨",
  receipt: "🧾",
};

const TYPE_LABELS: Record<string, string> = {
  package: "הזמנה",
  flight: "טיסה",
  hotel: "מלון",
  receipt: "קבלה",
};

async function ensureConnection(): Promise<string | null> {
  if (!isImapConfigured()) {
    return "❌ מייל iCloud לא מוגדר. צריך להגדיר ICLOUD_IMAP_EMAIL ו-ICLOUD_IMAP_PASSWORD.";
  }
  if (!isImapConnected()) {
    try {
      await connectImap();
    } catch {
      // Ignore, check below
    }
    if (!isImapConnected()) {
      return "❌ אין חיבור למייל iCloud כרגע. אנסה שוב בקרוב.";
    }
  }
  return null;
}

export const emailHandlers: Record<string, ToolHandler> = {
  read_emails: async (input) => {
    const err = await ensureConnection();
    if (err) return err;

    const hours = input.hours || 24;
    const limit = input.limit || 15;

    const emails: ParsedEmail[] = await fetchRecentEmails(hours, limit);
    if (emails.length === 0) {
      return `אין אימיילים חדשים ב-${hours} שעות האחרונות.`;
    }

    return emails
      .map((e: ParsedEmail) => {
        const date = new Date(e.date).toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `📧 מ: ${e.from} (${date})\nנושא: ${e.subject}\n${e.snippet}`;
      })
      .join("\n---\n");
  },

  search_emails: async (input) => {
    const err = await ensureConnection();
    if (err) return err;

    const days = input.days || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const emails: ParsedEmail[] = await searchEmails({
      keyword: input.keyword,
      from: input.from,
      since,
      limit: input.limit || 10,
    });

    if (emails.length === 0) {
      return `לא נמצאו אימיילים עם "${input.keyword}"${input.from ? ` מ-${input.from}` : ""}.`;
    }

    return emails
      .map((e: ParsedEmail) => {
        const date = new Date(e.date).toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `📧 מ: ${e.from} (${date})\nנושא: ${e.subject}\n${e.snippet}`;
      })
      .join("\n---\n");
  },

  check_email_orders: async (input) => {
    const type = input.type as EmailOrderType | undefined;
    const days = input.days || 30;

    const orders: EmailOrder[] = getEmailOrders({ type, days });

    if (orders.length === 0) {
      const typeLabel = type ? TYPE_LABELS[type] || type : "הזמנות";
      return `לא נמצאו ${typeLabel} במייל ב-${days} ימים האחרונים.`;
    }

    return orders
      .map((o: EmailOrder) => {
        const emoji = TYPE_EMOJIS[o.type] || "📧";
        const date = new Date(o.emailDate).toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
        });
        const parts = [`${emoji} ${o.summary} (${date})`];

        if (o.trackingNumber) parts.push(`  מספר מעקב: ${o.trackingNumber}`);
        if (o.flightNumber) parts.push(`  טיסה: ${o.flightNumber}`);
        if (o.route) parts.push(`  מסלול: ${o.route}`);
        if (o.hotelName) parts.push(`  מלון: ${o.hotelName}`);
        if (o.checkInDate) parts.push(`  צ'ק-אין: ${o.checkInDate}`);
        if (o.linkedDeliveryId) parts.push(`  📱 יש הודעת SMS מקושרת`);

        const statusLabels: Record<string, string> = {
          detected: "זוהה",
          confirmed: "מאושר",
          delivered: "נמסר",
          completed: "הושלם",
          dismissed: "נדחה",
        };
        parts.push(`  סטטוס: ${statusLabels[o.status] || o.status}`);

        return parts.join("\n");
      })
      .join("\n---\n");
  },
};
