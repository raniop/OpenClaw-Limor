/**
 * Email Order Detector — identifies order confirmations, flights, hotels, receipts.
 * Deterministic pattern matching, no AI calls (same approach as delivery-detector.ts).
 */
import type { ParsedEmail, EmailOrder, EmailOrderType } from "./email-types";

// ─── Package Order Patterns ────────────────────────────────────────────

const PACKAGE_SENDER_DOMAINS = [
  "amazon.com",
  "amazon.co.il",
  "aliexpress.com",
  "shein.com",
  "temu.com",
  "iherb.com",
  "ebay.com",
  "etsy.com",
  "zara.com",
  "hm.com",
  "asos.com",
  "nike.com",
  "adidas.com",
  "next.co.il",
  "terminalx.com",
  "ksp.co.il",
  "ivory.co.il",
  "bug.co.il",
  "lastprice.co.il",
  "shopifyemail.com",
  "shopify.com",
  "wix.com",
  "bigcommerce.com",
];

const PACKAGE_SUBJECT_PATTERNS = [
  /order\s*confirm|your\s*order|order\s*placed|order\s*received/i,
  /אישור\s*הזמנה|הזמנתך\s*התקבלה|הזמנה\s*חדשה/i,
  /shipped|dispatched|out\s*for\s*delivery|on\s*its\s*way/i,
  /נשלח|יצא\s*למשלוח|בדרך\s*אליך/i,
  /tracking\s*number|מספר\s*מעקב/i,
  /delivery\s*confirm|נמסר\s*בהצלחה/i,
  /shipment\s*from\s*order|your\s*package|your\s*shipment/i,
  /order\s*#\s*\w+.*(?:ship|way|deliver)/i,
];

// ─── Flight Patterns ───────────────────────────────────────────────────

const FLIGHT_SENDER_DOMAINS = [
  "elal.com",
  "elal.co.il",
  "israir.co.il",
  "arkia.co.il",
  "ryanair.com",
  "easyjet.com",
  "wizzair.com",
  "wizz.com",
  "turkishairlines.com",
  "lufthansa.com",
  "swiss.com",
  "airfrance.com",
  "klm.com",
  "britishairways.com",
  "united.com",
  "delta.com",
  "aegeanair.com",
  "vueling.com",
  "transavia.com",
];

const FLIGHT_BOOKING_DOMAINS = [
  "booking.com",
  "expedia.com",
  "kayak.com",
  "skyscanner.com",
  "kiwi.com",
  "google.com",
  "trip.com",
  "lastminute.com",
  "cheaptickets.com",
  "gotogate.com",
  "edreams.com",
  "eskytravel.com",
  "mytrip.com",
];

const FLIGHT_SUBJECT_PATTERNS = [
  /flight.*(?:confirm|book|itinerary|reserv)/i,
  /e-?ticket|boarding\s*pass|travel\s*itinerary/i,
  /אישור\s*טיסה|כרטיס\s*טיסה|אישור\s*הזמנת\s*טיסה/i,
  /booking\s*confirm.*(?:flight|air)/i,
  /your\s*trip\s*to|your\s*flight\s*to/i,
];

// ─── Hotel Patterns ────────────────────────────────────────────────────

const HOTEL_SENDER_DOMAINS = [
  "booking.com",
  "hotels.com",
  "airbnb.com",
  "agoda.com",
  "expedia.com",
  "trivago.com",
  "fattal.co.il",
  "danhotels.com",
  "isrotel.com",
  "atlas.co.il",
  "leonardo-hotels.com",
  "marriott.com",
  "hilton.com",
  "ihg.com",
  "accor.com",
  "hyatt.com",
];

const HOTEL_SUBJECT_PATTERNS = [
  /hotel.*(?:confirm|book|reserv)|(?:confirm|book|reserv).*hotel/i,
  /אישור\s*(?:הזמנת?\s*)?מלון|אישור\s*לינה|reservation\s*confirm/i,
  /check[\s-]?in\s*(?:detail|confirm|info)/i,
  /צ'ק[\s-]?אין|your\s*stay\s*at|your\s*reservation\s*at/i,
  /accommodation\s*confirm|your\s*booking\s*at/i,
];

// ─── Receipt Patterns ──────────────────────────────────────────────────

const RECEIPT_SENDER_DOMAINS = [
  "paypal.com",
  "bit.co.il",
  "paybox.co.il",
  "apple.com",
  "google.com",
  "steampowered.com",
  "spotify.com",
  "netflix.com",
];

const RECEIPT_SUBJECT_PATTERNS = [
  /receipt\s*(?:for|from)|payment\s*confirm|payment\s*received/i,
  /קבלה|חשבונית|אישור\s*תשלום|תשלום\s*התקבל/i,
  /invoice|your\s*purchase|transaction\s*confirm/i,
];

// ─── Exclusion Patterns (false positives) ──────────────────────────────

const EXCLUDE_SUBJECT_PATTERNS = [
  /sale|מבצע|coupon|קופון|%\s*off|הנחה\s*מיוחדת/i,
  /newsletter|עדכון\s*שבועי|weekly\s*update/i,
  /password\s*reset|איפוס\s*סיסמ/i,
  /verify\s*your\s*email|אימות\s*מייל/i,
  /unsubscribe|הסרה\s*מרשימת/i,
  /cart\s*reminder|עגלה\s*שנשכחה|forgot\s*something/i,
  /wish\s*list|recommend|המלצ/i,
];

function hasUnsubscribeHeader(email: ParsedEmail): boolean {
  // Simple heuristic: marketing emails often have unsubscribe links in body
  return /unsubscribe|הסרה\s*מרשימת\s*תפוצה|להסרה\s*לחצ/i.test(email.textBody);
}

// ─── Detection Logic ───────────────────────────────────────────────────

function getDomain(email: string): string {
  const match = email.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : "";
}

function matchesDomain(fromAddress: string, domains: string[]): boolean {
  const domain = getDomain(fromAddress);
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function matchesPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Classify an email into an order type, or null if not an order.
 */
export function classifyEmailType(
  email: ParsedEmail
): EmailOrderType | null {
  const { subject, fromAddress, textBody } = email;

  // Exclude false positives first
  if (matchesPatterns(subject, EXCLUDE_SUBJECT_PATTERNS)) return null;
  if (hasUnsubscribeHeader(email) && !matchesPatterns(subject, PACKAGE_SUBJECT_PATTERNS)) {
    return null;
  }

  // Flight detection (check before hotel since booking.com can be both)
  if (matchesDomain(fromAddress, FLIGHT_SENDER_DOMAINS)) {
    if (matchesPatterns(subject, FLIGHT_SUBJECT_PATTERNS)) return "flight";
    if (matchesPatterns(textBody, FLIGHT_SUBJECT_PATTERNS)) return "flight";
  }
  if (matchesDomain(fromAddress, FLIGHT_BOOKING_DOMAINS)) {
    if (matchesPatterns(subject, FLIGHT_SUBJECT_PATTERNS)) return "flight";
  }
  // Standalone flight subject pattern (any sender)
  if (matchesPatterns(subject, FLIGHT_SUBJECT_PATTERNS)) return "flight";

  // Hotel detection
  if (matchesDomain(fromAddress, HOTEL_SENDER_DOMAINS)) {
    if (matchesPatterns(subject, HOTEL_SUBJECT_PATTERNS)) return "hotel";
    if (matchesPatterns(textBody, HOTEL_SUBJECT_PATTERNS)) return "hotel";
  }
  if (matchesPatterns(subject, HOTEL_SUBJECT_PATTERNS)) return "hotel";

  // Package detection
  if (matchesDomain(fromAddress, PACKAGE_SENDER_DOMAINS)) {
    if (matchesPatterns(subject, PACKAGE_SUBJECT_PATTERNS)) return "package";
    // Known retailer + any order-like subject
    if (/order|הזמנ|ship|משלוח/i.test(subject)) return "package";
  }
  if (matchesPatterns(subject, PACKAGE_SUBJECT_PATTERNS)) return "package";

  // Receipt detection (last — widest net)
  if (matchesDomain(fromAddress, RECEIPT_SENDER_DOMAINS)) {
    if (matchesPatterns(subject, RECEIPT_SUBJECT_PATTERNS)) return "receipt";
  }
  if (matchesPatterns(subject, RECEIPT_SUBJECT_PATTERNS)) return "receipt";

  return null;
}

// ─── Field Extraction ──────────────────────────────────────────────────

function extractOrderNumber(text: string): string | undefined {
  const patterns = [
    /order\s*#?\s*[:.]?\s*(\d[\d-]{4,})/i,
    /מספר\s*הזמנה[:\s]*(\d[\d-]{4,})/i,
    /confirmation\s*#?\s*[:.]?\s*([A-Z0-9-]{5,})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

function extractTrackingNumber(text: string): string | undefined {
  const patterns = [
    /tracking\s*(?:number|#|:)\s*([A-Z0-9]{8,30})/i,
    /מספר\s*מעקב[:\s]*([A-Z0-9]{8,30})/i,
    /(?:RR|EE|CP|CJ|LB|LX|RA|RB|RC)\d{9}[A-Z]{2}/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return undefined;
}

function extractAmount(text: string): string | undefined {
  const patterns = [
    /(?:total|סה"כ|סכום)[:\s]*([₪$€]\s*[\d,.]+)/i,
    /([₪$€]\s*[\d,.]+)/,
    /([\d,.]+)\s*₪/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return undefined;
}

function extractFlightNumber(text: string): string | undefined {
  // IATA flight: 2-letter code + 1-4 digit number
  const m = text.match(/\b([A-Z]{2})\s*(\d{1,4})\b/);
  if (m) return `${m[1]}${m[2]}`;
  return undefined;
}

function extractRoute(text: string): string | undefined {
  // Look for airport codes or city pairs
  const patterns = [
    /([A-Z]{3})\s*[→\->–]\s*([A-Z]{3})/,
    /(TLV|BEN[\s-]?GURION|נתב"ג|תל[\s-]?אביב).*?[→\->–]\s*(\S+)/i,
    /(\S+)\s*[→\->–]\s*(TLV|BEN[\s-]?GURION|נתב"ג|תל[\s-]?אביב)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return `${m[1]} → ${m[2]}`;
  }
  return undefined;
}

function extractDepartureDate(text: string): string | undefined {
  // Look for dates near "departure" or "depart" or "יציאה"
  const patterns = [
    /(?:depart|departure|יציאה|תאריך)[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

function extractHotelName(text: string): string | undefined {
  const patterns = [
    /(?:hotel|מלון)[:\s]*([^\n,]{3,50})/i,
    /(?:your\s*stay\s*at|reservation\s*at|your\s*booking\s*at)\s+([^\n,]{3,50})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return undefined;
}

function extractCheckInOut(
  text: string
): { checkIn?: string; checkOut?: string } {
  const checkInMatch = text.match(
    /(?:check[\s-]?in|צ'ק[\s-]?אין|arrival)[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i
  );
  const checkOutMatch = text.match(
    /(?:check[\s-]?out|צ'ק[\s-]?אאוט|departure)[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i
  );
  return {
    checkIn: checkInMatch?.[1],
    checkOut: checkOutMatch?.[1],
  };
}

function extractConfirmationNumber(text: string): string | undefined {
  const patterns = [
    /confirm(?:ation)?\s*(?:number|#|:)\s*([A-Z0-9-]{4,20})/i,
    /מספר\s*אישור[:\s]*([A-Z0-9-]{4,20})/i,
    /reservation\s*(?:number|#|:)\s*([A-Z0-9-]{4,20})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

function detectVendor(email: ParsedEmail): string {
  const domain = getDomain(email.fromAddress);
  const fromLower = email.from.toLowerCase();

  // Known vendor mappings
  const vendorMap: Record<string, string> = {
    "amazon.com": "Amazon",
    "amazon.co.il": "Amazon",
    "aliexpress.com": "AliExpress",
    "shein.com": "SHEIN",
    "temu.com": "Temu",
    "iherb.com": "iHerb",
    "ebay.com": "eBay",
    "etsy.com": "Etsy",
    "zara.com": "Zara",
    "hm.com": "H&M",
    "asos.com": "ASOS",
    "nike.com": "Nike",
    "adidas.com": "Adidas",
    "terminalx.com": "Terminal X",
    "ksp.co.il": "KSP",
    "ivory.co.il": "Ivory",
    "bug.co.il": "Bug",
    "elal.com": "אל על",
    "elal.co.il": "אל על",
    "israir.co.il": "ישראייר",
    "arkia.co.il": "ארקיע",
    "ryanair.com": "Ryanair",
    "easyjet.com": "EasyJet",
    "wizzair.com": "Wizz Air",
    "wizz.com": "Wizz Air",
    "turkishairlines.com": "Turkish Airlines",
    "lufthansa.com": "Lufthansa",
    "booking.com": "Booking.com",
    "airbnb.com": "Airbnb",
    "expedia.com": "Expedia",
    "hotels.com": "Hotels.com",
    "agoda.com": "Agoda",
    "fattal.co.il": "Fattal",
    "danhotels.com": "Dan Hotels",
    "isrotel.com": "Isrotel",
    "paypal.com": "PayPal",
    "apple.com": "Apple",
    "google.com": "Google",
    "bit.co.il": "Bit",
  };

  // Check domain
  for (const [d, v] of Object.entries(vendorMap)) {
    if (domain === d || domain.endsWith(`.${d}`)) return v;
  }

  // Extract from display name
  const nameMatch = email.from.match(/^([^<]+)/);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (name && name.length < 40) return name;
  }

  return domain || "לא ידוע";
}

// ─── Main Detection Function ───────────────────────────────────────────

function buildSummary(
  type: EmailOrderType,
  vendor: string,
  details: Partial<EmailOrder>
): string {
  switch (type) {
    case "package": {
      const order = details.orderNumber ? ` | מספר: ${details.orderNumber}` : "";
      const amount = details.amount ? ` | ${details.amount}` : "";
      return `הזמנה מ-${vendor}${order}${amount}`;
    }
    case "flight": {
      const flight = details.flightNumber ? ` ${details.flightNumber}` : "";
      const route = details.route ? ` ${details.route}` : "";
      const date = details.departureDate ? ` | ${details.departureDate}` : "";
      return `טיסה${flight}${route}${date} (${vendor})`;
    }
    case "hotel": {
      const hotel = details.hotelName ? ` ${details.hotelName}` : "";
      const checkIn = details.checkInDate ? ` | צ'ק-אין: ${details.checkInDate}` : "";
      return `מלון${hotel}${checkIn} (${vendor})`;
    }
    case "receipt": {
      const amount = details.amount ? ` ${details.amount}` : "";
      return `קבלה${amount} מ-${vendor}`;
    }
  }
}

/**
 * Detect if an email is an order/booking and extract structured data.
 * Returns null if not an order.
 */
export function detectEmailOrder(
  email: ParsedEmail
): Omit<EmailOrder, "id" | "createdAt"> | null {
  const type = classifyEmailType(email);
  if (!type) return null;

  const vendor = detectVendor(email);
  const text = `${email.subject}\n${email.textBody}`;

  const details: Partial<EmailOrder> = {};

  switch (type) {
    case "package":
      details.orderNumber = extractOrderNumber(text);
      details.trackingNumber = extractTrackingNumber(text);
      details.amount = extractAmount(text);
      break;
    case "flight":
      details.flightNumber = extractFlightNumber(text);
      details.route = extractRoute(text);
      details.departureDate = extractDepartureDate(text);
      break;
    case "hotel": {
      details.hotelName = extractHotelName(text);
      const dates = extractCheckInOut(text);
      details.checkInDate = dates.checkIn;
      details.checkOutDate = dates.checkOut;
      details.confirmationNumber = extractConfirmationNumber(text);
      break;
    }
    case "receipt":
      details.amount = extractAmount(text);
      details.orderNumber = extractOrderNumber(text);
      break;
  }

  const summary = buildSummary(type, vendor, details);

  return {
    emailUid: email.uid,
    messageId: email.messageId,
    type,
    status: "detected",
    from: email.from,
    subject: email.subject,
    emailDate: email.date,
    vendor,
    summary,
    ...details,
  };
}
