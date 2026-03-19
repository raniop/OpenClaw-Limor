/**
 * Delivery/Package Detector — identifies SMS messages about deliveries and shipments.
 * Deterministic pattern matching, no AI calls.
 */
import type { SmsMessage } from "./sms-reader";

export interface DeliveryAlert {
  message: SmsMessage;
  type: "delivery" | "shipping" | "pickup" | "tracking";
  carrier: string;
  trackingNumber?: string;
  summary: string;
}

// Known delivery/shipping senders
const DELIVERY_SENDERS = new Set([
  "DHL", "FedEx", "FDXIsrael", "UPS", "USPS",
  "דואר ישראל", "Israel Post", "Israel_Post",
  "Bpost", "TNT",
  "חברת שליחויות", "Mahirpost",
  "Box", "iHerb", "AliExpress", "Ali Express",
  "Amazon", "Shein", "SHEIN", "Temu",
  "Wolt", "wolt",
  "GetPack", "Boxit", "בוקסיט",
  "HFD", "חברת חלוקה",
  "שליח", "courier",
  "כץ עד הבית",
  "CARGO", "cargo",
  "UPS_IL_ASC",
]);

// Patterns that indicate delivery/shipping content
const DELIVERY_PATTERNS = [
  /חבילה שמספרה|חבילה.*נמסר|חבילה.*יצאה/i,
  /משלוח מספר|משלוח.*נשלח|משלוח.*ממתין/i,
  /נקודת איסוף|pickup point|collection point|לוקר|locker/i,
  /הזמנה.*מחסן|הזמנתך מ/i,
  /בדרך אליך|on its way|out for delivery/i,
  /מכס|customs|שחרור ממכס/i,
  /דואר רשום|registered mail/i,
  /נמסר לך|תימסר בכתובת/i,
  /חברת ההפצה|חברת שליחויות/i,
];

// False positive patterns to exclude
const EXCLUDE_PATTERNS = [
  /עירייה|עיריית|דוברות/i,
  /מטח.*טילים|אזעק|מקלט|פיקוד העורף/i,
  /הודעה חשובה.*נהגים|ציבור הנהגים/i,
  /משטרה|משרד הבריאות/i,
  /זמן נוסף עבור היישום|Screen Time|בקשה של.*לזמן נוסף/i,
  /הגרלה|פרסים מטורפים|הרב שמואל/i,
];

// Tracking number patterns
const TRACKING_PATTERNS = [
  /(?:tracking|מעקב|מספר מעקב)[:\s]*([A-Z0-9]{8,30})/i,
  /(?:RR|EE|CP|CJ|LB|LX|RA|RB|RC)\d{9}[A-Z]{2}/,  // International postal
  /\b\d{10,22}\b/,  // Generic long number (DHL, etc.)
];

// Israel Post: extract both tracking number and postal code (e.g. "ג 1077")
const ISRAEL_POST_TRACKING = /משלוח\s+([A-Z]{2}\d+[A-Z]*)\s*\n?\s*(ג\s*\d+)?/i;

/**
 * Check if an SMS message is about a delivery/package.
 */
export function isDeliveryMessage(msg: SmsMessage): boolean {
  if (msg.isFromMe) return false;

  // Exclude false positives first
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(msg.text)) return false;
  }

  // Check sender
  for (const sender of DELIVERY_SENDERS) {
    if (msg.sender.includes(sender) || msg.text.includes(sender)) return true;
  }

  // Check content patterns
  for (const pattern of DELIVERY_PATTERNS) {
    if (pattern.test(msg.text)) return true;
  }

  return false;
}

/**
 * Parse a delivery message into a structured alert.
 */
export function parseDeliveryAlert(msg: SmsMessage): DeliveryAlert | null {
  if (!isDeliveryMessage(msg)) return null;

  const carrier = detectCarrier(msg);
  const trackingNumber = extractTrackingNumber(msg.text);
  const type = detectDeliveryType(msg.text);
  const summary = buildSummary(msg, carrier, type, trackingNumber);

  return { message: msg, type, carrier, trackingNumber, summary };
}

/**
 * Scan a list of messages and return only delivery alerts.
 */
export function findDeliveryAlerts(messages: SmsMessage[]): DeliveryAlert[] {
  return messages
    .map(parseDeliveryAlert)
    .filter((a): a is DeliveryAlert => a !== null);
}

function detectCarrier(msg: SmsMessage): string {
  const text = msg.text + " " + msg.sender;
  if (/DHL/i.test(text)) return "DHL";
  if (/FedEx|FDXIsrael|FDX/i.test(text)) return "FedEx";
  if (/UPS/i.test(text)) return "UPS";
  if (/Amazon/i.test(text)) return "Amazon";
  if (/AliExpress|Ali Express/i.test(text)) return "AliExpress";
  if (/Shein|SHEIN/i.test(text)) return "Shein";
  if (/Temu/i.test(text)) return "Temu";
  if (/iHerb/i.test(text)) return "iHerb";
  if (/דואר ישראל|Israel.Post/i.test(text)) return "דואר ישראל";
  if (/כץ עד הבית/i.test(text)) return "כץ עד הבית";
  if (/Wolt|wolt/i.test(text)) return "Wolt";
  if (/Boxit|בוקסיט/i.test(text)) return "Boxit";
  if (/GetPack/i.test(text)) return "GetPack";
  if (/HFD/i.test(text)) return "HFD";
  if (/JACQUEMUS/i.test(text)) return "JACQUEMUS";
  if (/CARGO/i.test(text)) return "CARGO";
  // Try to detect store/sender from text patterns
  const storeMatch = text.match(/(?:הזמנתך מ|מאת|from)\s*([A-Za-z][\w\s']+)/i);
  if (storeMatch) return storeMatch[1].trim().substring(0, 30);
  return "משלוח";
}

function detectDeliveryType(text: string): DeliveryAlert["type"] {
  if (/הגיעה?|arrived|delivered|נמסר/i.test(text)) return "delivery";
  if (/נקודת איסוף|pickup|לוקר|locker|אסוף/i.test(text)) return "pickup";
  if (/מעקב|tracking|track/i.test(text)) return "tracking";
  return "shipping";
}

function extractTrackingNumber(text: string): string | undefined {
  // Israel Post special: extract both tracking + postal code
  const ipMatch = text.match(ISRAEL_POST_TRACKING);
  if (ipMatch) {
    const tracking = ipMatch[1];
    const postalCode = ipMatch[2]?.trim();
    return postalCode ? `${tracking} | ${postalCode}` : tracking;
  }
  for (const pattern of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
  }
  return undefined;
}

function buildSummary(
  msg: SmsMessage,
  carrier: string,
  type: DeliveryAlert["type"],
  trackingNumber?: string
): string {
  const typeLabels: Record<string, string> = {
    delivery: "חבילה הגיעה",
    shipping: "חבילה בדרך",
    pickup: "חבילה מחכה לאיסוף",
    tracking: "עדכון מעקב",
  };
  const label = typeLabels[type] || "עדכון משלוח";
  const tracking = trackingNumber ? ` (${trackingNumber})` : "";
  return `${label} מ-${carrier}${tracking}`;
}
