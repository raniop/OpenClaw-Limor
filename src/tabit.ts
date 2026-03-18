import {
  launchBookingBrowser,
  safeScreenshot,
  buildFallbackMessage,
} from "./booking-utils";
import type { Page } from "puppeteer";

const TABIT_API = "https://bridge.tabit.cloud/organizations/search";

interface TabitSlot {
  timestamp: string;
  standby: boolean;
  pending: boolean;
  class_name: string;
}

interface TabitRestaurant {
  _id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  distance: number;
  publicUrlLabel: string;
  time_slots: TabitSlot[];
}

// Known restaurant locations for direct lookup
const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "תל אביב": { lat: 32.0853, lng: 34.7818 },
  "ירושלים": { lat: 31.7683, lng: 35.2137 },
  "חיפה": { lat: 32.7940, lng: 34.9896 },
  "הרצליה": { lat: 32.1629, lng: 34.7915 },
  "רמת גן": { lat: 32.0680, lng: 34.8248 },
  "נתניה": { lat: 32.3215, lng: 34.8532 },
  "ראשון לציון": { lat: 31.9730, lng: 34.7925 },
  "פתח תקווה": { lat: 32.0841, lng: 34.8878 },
  "באר שבע": { lat: 31.2529, lng: 34.7915 },
  "אשדוד": { lat: 31.8014, lng: 34.6435 },
};

// Default to Tel Aviv center
const DEFAULT_LOCATION = { lat: 32.0853, lng: 34.7818 };

export async function searchTabit(
  restaurantName: string,
  date: string, // YYYYMMDD
  time: string, // HHMM
  partySize: number,
  city?: string
): Promise<string> {
  try {
    // Build ISO timestamp from date + time
    const year = date.slice(0, 4);
    const month = date.slice(4, 6);
    const day = date.slice(6, 8);
    const hour = time.slice(0, 2);
    const minute = time.slice(2, 4);

    // Create timestamp in Israel time (UTC+2/+3) - approximate with UTC
    const localDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
    // Convert to UTC (Israel is UTC+3 in summer, UTC+2 in winter)
    const utcDate = new Date(localDate.getTime() - 3 * 60 * 60 * 1000);
    const timestamp = utcDate.toISOString();

    const location = (city && KNOWN_LOCATIONS[city]) || DEFAULT_LOCATION;

    const booking = JSON.stringify({
      timestamp,
      seats_count: String(partySize),
    });

    const url = `${TABIT_API}?lat=${location.lat}&lng=${location.lng}&extendLimit=true&booking=${encodeURIComponent(booking)}`;

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return `שגיאה בחיפוש טאביט: ${res.status}`;
    }

    const data = await res.json() as { organizations: TabitRestaurant[] };
    const restaurants = data.organizations || [];

    // Search for matching restaurant by name (case insensitive, partial match)
    const searchLower = restaurantName.toLowerCase();
    const matches = restaurants.filter((r) => {
      const nameLower = r.name.toLowerCase();
      const labelLower = (r.publicUrlLabel || "").toLowerCase();
      return (
        nameLower.includes(searchLower) ||
        searchLower.includes(nameLower) ||
        labelLower.includes(searchLower) ||
        searchLower.includes(labelLower)
      );
    });

    if (matches.length === 0) {
      // Show available restaurants nearby
      const available = restaurants
        .filter((r) => r.time_slots && r.time_slots.length > 0)
        .slice(0, 5)
        .map((r) => r.name)
        .join(", ");

      let result = `לא מצאתי את "${restaurantName}" בטאביט באזור ${city || "תל אביב"}.`;
      if (available) {
        result += `\nמסעדות זמינות באזור: ${available}`;
      }
      return result;
    }

    const restaurant = matches[0];
    const slots = restaurant.time_slots || [];

    if (slots.length === 0) {
      return `אין שולחן פנוי ב-${restaurant.name} בתאריך ${formatDate(date)} בשעה ${formatTime(time)} ל-${partySize} סועדים.`;
    }

    // Check if any slot is available (not standby)
    const availableSlots = slots.filter((s) => !s.standby && !s.pending);
    const standbySlots = slots.filter((s) => s.standby);

    let result = "";
    if (availableSlots.length > 0) {
      result = `יש שולחן פנוי! ✅\nמסעדה: ${restaurant.name}`;
      if (restaurant.address) result += `\nכתובת: ${restaurant.address}, ${restaurant.city}`;
      result += `\nתאריך: ${formatDate(date)}\nסועדים: ${partySize}`;

      const times = availableSlots.map((s) => {
        const d = new Date(s.timestamp);
        return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
      }).join(", ");
      result += `\nשעות זמינות: ${times}`;
      result += `\nלהזמנה: https://tabitisrael.co.il/${restaurant.publicUrlLabel || restaurant._id}`;
    } else if (standbySlots.length > 0) {
      result = `אין שולחן פנוי ב-${restaurant.name}, אבל אפשר להירשם לרשימת המתנה.`;
      result += `\nלהרשמה: https://tabitisrael.co.il/${restaurant.publicUrlLabel || restaurant._id}`;
    } else {
      result = `אין שולחן פנוי ב-${restaurant.name} בתאריך ${formatDate(date)} בשעה ${formatTime(time)} ל-${partySize} סועדים.`;
    }

    return result;
  } catch (error: any) {
    return `שגיאה בחיפוש טאביט: ${error.message}`;
  }
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function formatTime(hhmm: string): string {
  if (hhmm.length !== 4) return hhmm;
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}

// --- Booking via Puppeteer ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectAngularDropdown(
  page: Page,
  ariaLabel: string,
  value: string,
  partial = false
): Promise<void> {
  const selector = `mat-select[aria-label="${ariaLabel}"]`;
  await page.click(selector);
  await page.waitForSelector(".mat-mdc-select-panel", { timeout: 5000 });
  await delay(300);

  await page.evaluate(
    (val: string, isPartial: boolean) => {
      const options = document.querySelectorAll(
        ".mat-mdc-select-panel mat-option"
      );
      for (const opt of options) {
        const text = opt.textContent?.trim() || "";
        if (isPartial ? text.includes(val) : text === val) {
          (opt as HTMLElement).click();
          return;
        }
      }
    },
    value,
    partial
  );
  await delay(300);
}

export async function bookTabit(params: {
  publicUrlLabel: string;
  date: string; // YYYYMMDD
  time: string; // HH:MM
  partySize: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}): Promise<string> {
  const url = `https://tabitisrael.co.il/${params.publicUrlLabel}`;
  let browser = null as Awaited<ReturnType<typeof launchBookingBrowser>> | null;

  try {
    browser = await launchBookingBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`🍽️ Tabit booking: navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    // Wait for booking widget
    await page.waitForSelector("mat-select, web-selection-bar", {
      timeout: 15000,
    });
    await delay(1500);

    // Select party size
    try {
      await selectAngularDropdown(
        page,
        "בְּחִירַת מִסְפָר אוֹרְחִים",
        String(params.partySize)
      );
    } catch (e) {
      console.log("Could not set party size, continuing with default");
    }

    // Select date (match on "day / month" pattern)
    try {
      const day = parseInt(params.date.slice(6, 8));
      const month = parseInt(params.date.slice(4, 6));
      await selectAngularDropdown(
        page,
        "בְּחִירַת יוֹם",
        `${day} / ${month}`,
        true
      );
    } catch (e) {
      console.log("Could not set date, continuing with default");
    }

    // Select time
    try {
      await selectAngularDropdown(page, "בְּחִירַת שָעָה", params.time);
    } catch (e) {
      console.log("Could not set time, continuing with default");
    }

    // Click "Find me a table"
    await page.click("button.action-button");
    console.log("🔍 Tabit: searching for tables...");

    // Wait for time slots
    await page.waitForSelector("time-slots a.time-slot", { timeout: 15000 });
    await delay(500);

    // Click the matching time slot
    const clicked = await page.evaluate((targetTime: string) => {
      const slots = document.querySelectorAll("time-slots a.time-slot");
      for (const slot of slots) {
        const timeEl = slot.querySelector(".time");
        if (timeEl && timeEl.textContent?.trim() === targetTime) {
          (slot as HTMLElement).click();
          return true;
        }
      }
      if (slots.length > 0) {
        (slots[0] as HTMLElement).click();
        return true;
      }
      return false;
    }, params.time);

    if (!clicked) {
      return buildFallbackMessage("טאביט", url);
    }

    // Handle seating preference dialog if it appears
    try {
      await page.waitForSelector("app-list-dialog .list-item", {
        timeout: 3000,
      });
      await delay(300);
      await page.click("app-list-dialog .list-item");
    } catch {
      // No seating preference dialog
    }

    // Wait for customer details form
    console.log("📝 Tabit: filling customer details...");
    await page.waitForSelector('input[name="first_name"]', { timeout: 15000 });
    await delay(500);

    // Fill form fields
    await page.type('input[name="first_name"]', params.firstName, {
      delay: 30,
    });
    await page.type('input[name="last_name"]', params.lastName, { delay: 30 });

    // Phone - clear existing value first
    const phoneInput = await page.$('input[name="phone"]');
    if (phoneInput) {
      await phoneInput.click({ count: 3 });
      await phoneInput.type(params.phone, { delay: 30 });
    }

    if (params.email) {
      await page.type('input[name="email"]', params.email, { delay: 30 });
    }

    // Submit
    await page.click("button.save-button");
    console.log("✅ Tabit: form submitted, waiting for confirmation...");

    await delay(5000);

    // Check for success
    const content = await page.content();
    const summary = `מסעדה: ${params.publicUrlLabel}\nתאריך: ${formatDate(params.date)}\nשעה: ${params.time}\nסועדים: ${params.partySize}\nעל שם: ${params.firstName} ${params.lastName}`;

    if (
      content.includes("אישור") ||
      content.includes("ההזמנה") ||
      content.includes("confirmation")
    ) {
      return `ההזמנה בוצעה בהצלחה! ✅\n${summary}`;
    }

    await safeScreenshot(page, "tabit-result");
    return `ההזמנה נשלחה ✅ (ייתכן שממתינה לאישור מהמסעדה)\n${summary}`;
  } catch (error: any) {
    console.error("Tabit booking error:", error.message);
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0)
          await safeScreenshot(pages[pages.length - 1], "tabit-error");
      } catch {}
    }
    return buildFallbackMessage("טאביט", url);
  } finally {
    if (browser) await browser.close();
  }
}
