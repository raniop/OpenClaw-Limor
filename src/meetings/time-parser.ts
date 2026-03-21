/**
 * Hebrew time expression parser.
 * Parses natural Hebrew time expressions into structured date/time.
 */

export interface ParsedTime {
  date?: string;  // ISO date string YYYY-MM-DD
  time?: string;  // HH:MM
}

/**
 * Parse Hebrew time expressions into date and time components.
 * Examples: "מחר ב-14:00", "ביום ראשון", "היום בשעה 3", "23.3 ב-14:00", "23/3 בשעה 14"
 */
export function parseHebrewTime(text: string): ParsedTime | null {
  if (!text || !text.trim()) return null;

  const result: ParsedTime = {};
  const now = new Date();

  // Extract time component first
  result.time = extractTime(text);

  // Extract date component
  result.date = extractDate(text, now);

  // Return null if we couldn't parse anything
  if (!result.date && !result.time) return null;

  return result;
}

/**
 * Extract time from text.
 * Matches: "14:00", "ב-14:00", "בשעה 14:00", "בשעה 3", "ב-3 בצהריים", "ב-3 אחה״צ"
 */
function extractTime(text: string): string | undefined {
  // Match HH:MM patterns (with optional prefix)
  const hhmmMatch = text.match(/(?:ב-?|בשעה\s*)(\d{1,2}):(\d{2})/);
  if (hhmmMatch) {
    const h = parseInt(hhmmMatch[1], 10);
    const m = parseInt(hhmmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Match bare HH:MM (no prefix)
  const bareHhmmMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (bareHhmmMatch) {
    const h = parseInt(bareHhmmMatch[1], 10);
    const m = parseInt(bareHhmmMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Match hour-only: "בשעה 3", "ב-14", etc.
  const hourOnlyMatch = text.match(/(?:ב-?|בשעה\s*)(\d{1,2})(?:\s|$|[,.])/);
  if (hourOnlyMatch) {
    let h = parseInt(hourOnlyMatch[1], 10);
    // Detect PM indicators
    if (h < 12 && /(?:אחה[״"]צ|בצהריים|בערב|אחרי הצהריים)/.test(text)) {
      h += 12;
    }
    // Detect AM/morning for ambiguous hours
    if (h < 12 && h > 0 && /(?:בבוקר|בלילה)/.test(text)) {
      // keep as-is
    }
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return undefined;
}

/**
 * Extract date from text.
 * Matches: "היום", "מחר", "ביום ראשון", "23.3", "23/3", "23.3.2026", "23/03/2026"
 */
function extractDate(text: string, now: Date): string | undefined {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // "היום"
  if (/היום/.test(text)) {
    return formatDate(today);
  }

  // "מחר"
  if (/מחר/.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // "מחרתיים"
  if (/מחרתיים/.test(text)) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return formatDate(dayAfter);
  }

  // Hebrew day names: "ביום ראשון", "ביום שני", etc.
  const dayNames: Record<string, number> = {
    "ראשון": 0,
    "שני": 1,
    "שלישי": 2,
    "רביעי": 3,
    "חמישי": 4,
    "שישי": 5,
    "שבת": 6,
  };

  for (const [name, dayNum] of Object.entries(dayNames)) {
    const regex = new RegExp(`(?:ב)?יום\\s+${name}`);
    if (regex.test(text)) {
      const target = new Date(today);
      const currentDay = target.getDay();
      let daysToAdd = dayNum - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next occurrence
      target.setDate(target.getDate() + daysToAdd);
      return formatDate(target);
    }
  }

  // Date patterns: "23.3", "23/3", "23.3.2026", "23/3/2026", "23.03.26"
  const dateMatch = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000; // "26" -> 2026

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1, day);
      // If the date is in the past (this year), bump to next year
      if (!dateMatch[3] && date < today) {
        date.setFullYear(date.getFullYear() + 1);
      }
      return formatDate(date);
    }
  }

  return undefined;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
