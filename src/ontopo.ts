import { v4 as uuidv4 } from "uuid";
import {
  launchBookingBrowser,
  safeScreenshot,
  buildFallbackMessage,
} from "./booking-utils";
import type { Page } from "puppeteer";

const ONTOPO_AVAILABILITY_API = "https://ontopo.co.il/api/availability/searchAvailability";
const ONTOPO_META_API = "https://ontopo.co.il/api/content/fetchContentMeta";
const ONTOPO_SEARCH_API = "https://ontopo.com/api/venue_search";
const ONTOPO_DISTRIBUTOR = "15171493";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface OntopoSearchResult {
  slug: string;
  title: string;
  address?: string;
}

/**
 * Search for a restaurant by name using the venue search API.
 * Searches in both Hebrew and English locales.
 */
async function searchVenue(query: string): Promise<OntopoSearchResult | null> {
  for (const locale of ["he", "en"]) {
    try {
      const url = `${ONTOPO_SEARCH_API}?slug=${ONTOPO_DISTRIBUTOR}&version=1&terms=${encodeURIComponent(query)}&locale=${locale}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) continue;
      const results = await res.json() as OntopoSearchResult[];
      if (results.length > 0) return results[0];
    } catch {}
  }
  return null;
}

/**
 * Try to resolve a text slug to a page slug via fetchContentMeta.
 */
async function tryMetaLookup(slug: string): Promise<string | null> {
  try {
    const res = await fetch(ONTOPO_META_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ slug, distributor: ONTOPO_DISTRIBUTOR }),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, any>;
      if (data.slug && data.document_type === "page") return data.slug;
    }
  } catch {}
  return null;
}

/**
 * Resolve a text slug or restaurant name to a numeric page slug.
 * Strategy:
 * 1. Try exact meta lookup with the given slug
 * 2. Try venue search → get English title → lowercase → meta lookup
 * 3. Try slug variations (remove 'h', etc.)
 */
async function resolveNumericSlug(textSlug: string): Promise<{ numericSlug: string; name?: string; textSlug?: string } | null> {
  // 1. Try exact meta lookup
  const direct = await tryMetaLookup(textSlug);
  if (direct) return { numericSlug: direct, textSlug };

  // 2. Try venue search → English title → meta lookup
  const venue = await searchVenue(textSlug);
  if (venue) {
    // Try lowercase English title as text slug
    const englishSlug = venue.title.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (englishSlug && englishSlug !== textSlug) {
      const fromEnglish = await tryMetaLookup(englishSlug);
      if (fromEnglish) return { numericSlug: fromEnglish, name: venue.title, textSlug: englishSlug };
    }

    // Search again in English locale to get English name
    try {
      const enUrl = `${ONTOPO_SEARCH_API}?slug=${ONTOPO_DISTRIBUTOR}&version=1&terms=${encodeURIComponent(textSlug)}&locale=en`;
      const enRes = await fetch(enUrl, { headers: { "User-Agent": USER_AGENT } });
      if (enRes.ok) {
        const enResults = await enRes.json() as OntopoSearchResult[];
        if (enResults.length > 0) {
          const enSlug = enResults[0].title.toLowerCase().replace(/[^a-z0-9-]/g, "");
          if (enSlug && enSlug !== textSlug && enSlug !== englishSlug) {
            const fromEn = await tryMetaLookup(enSlug);
            if (fromEn) return { numericSlug: fromEn, name: venue.title, textSlug: enSlug };
          }
        }
      }
    } catch {}
  }

  // 3. Try common slug variations
  const variations = [
    textSlug.replace(/h/g, ""),        // esther → ester
    textSlug.replace(/-/g, ""),        // ester-yehud → esteryehud
    textSlug.split("-")[0],            // ester-yehud → ester
  ];
  for (const v of variations) {
    if (v && v !== textSlug) {
      const result = await tryMetaLookup(v);
      if (result) return { numericSlug: result, name: venue?.title, textSlug: v };
    }
  }

  return null;
}

export async function searchAvailability(
  restaurantSlug: string,
  date: string, // YYYYMMDD
  time: string, // HHMM
  partySize: number
): Promise<string> {
  try {
    // Resolve text slug to numeric slug
    const resolved = await resolveNumericSlug(restaurantSlug);
    if (!resolved) {
      return `לא מצאתי את המסעדה "${restaurantSlug}" באונטופו. נסה שם אחר.`;
    }
    const { numericSlug } = resolved;
    const displayName = resolved.name || restaurantSlug;
    const pageSlug = resolved.textSlug || restaurantSlug;

    const payload = {
      slug: numericSlug,
      locale: "he",
      criteria: {
        size: String(partySize),
        date,
        time,
      },
    };

    const res = await fetch(ONTOPO_AVAILABILITY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return `שגיאה בחיפוש אונטופו: ${res.status}`;
    }

    const data = await res.json() as Record<string, any>;

    // Check for API errors
    if (data.response?.errors) {
      return `שגיאה בחיפוש אונטופו: ${data.response.errors[0]?.message || "unknown error"}`;
    }

    const method = data.method;

    if (method === "standby" || method === "disabled") {
      return `אין שולחן פנוי ב-${displayName} בתאריך ${formatDate(date)} בשעה ${formatTime(time)} ל-${partySize} סועדים.`;
    }

    // Check for available areas/options
    const areas = data.areas as any[] | undefined;
    const restaurantUrl = `https://ontopo.com/he/il/page/${pageSlug}`;

    if (areas && areas.length > 0) {
      let result = `יש שולחן פנוי! ✅\nמסעדה: ${displayName}\nתאריך: ${formatDate(date)}\nשעה: ${formatTime(time)}\nסועדים: ${partySize}`;
      result += `\nלהזמנה: ${restaurantUrl}`;

      // Show available times from areas
      const allTimes: string[] = [];
      for (const area of areas) {
        const options = area.options as any[] | undefined;
        if (options) {
          for (const opt of options.slice(0, 5)) {
            if (opt.time) {
              const timeStr = formatTime(opt.time);
              const status = opt.text || "";
              allTimes.push(`${timeStr} (${status})`);
            }
          }
        }
      }
      if (allTimes.length > 0) {
        result += `\nזמנים זמינים: ${allTimes.slice(0, 8).join(", ")}`;
      }

      result += `\n[booking_data: slug=${numericSlug}]`;
      return result;
    }

    // Fallback: if no areas but also no standby/disabled, still might be available
    let result = `יש שולחן פנוי! ✅\nמסעדה: ${displayName}\nתאריך: ${formatDate(date)}\nשעה: ${formatTime(time)}\nסועדים: ${partySize}`;
    result += `\nלהזמנה: ${restaurantUrl}`;
    result += `\n[booking_data: slug=${restaurantSlug}, numeric_slug=${numericSlug}]`;
    return result;
  } catch (error: any) {
    return `שגיאה בחיפוש אונטופו: ${error.message}`;
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


export async function bookOntopo(params: {
  restaurantSlug: string;
  date: string; // YYYYMMDD
  time: string; // HH:MM
  partySize: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}): Promise<string> {
  let browser = null as Awaited<ReturnType<typeof launchBookingBrowser>> | null;

  try {
    // Resolve slug (AI may send "esther" but URL needs "ester")
    let urlSlug = params.restaurantSlug;
    const resolved = await resolveNumericSlug(params.restaurantSlug);
    if (resolved?.textSlug) {
      urlSlug = resolved.textSlug;
      console.log(`🔄 Ontopo booking: resolved slug "${params.restaurantSlug}" → "${urlSlug}"`);
    }
    const restaurantUrl = `https://ontopo.com/he/il/page/${urlSlug}`;

    browser = await launchBookingBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`🍽️ Ontopo booking: navigating to ${restaurantUrl}`);
    await page.goto(restaurantUrl, {
      waitUntil: "networkidle2",
      timeout: 25000,
    });

    // Wait for booking widget
    await page.waitForSelector("main.table-order, .find-table-btn", {
      timeout: 15000,
    });
    await delay(1500);

    // Click party size button (first button in RTL layout)
    const sizeButtons = await page.$$(
      ".table-order .table-button.button-dropdown"
    );
    if (sizeButtons.length > 0) {
      await sizeButtons[0].click();
      await page.waitForSelector(".shift-item[id^='size-']", {
        timeout: 5000,
      });
      await delay(500);

      // Select party size (0-indexed: size-0 = 1 person)
      const sizeIndex = params.partySize - 1;
      try {
        await page.click(`#size-${sizeIndex}`);
      } catch {
        // Try clicking by text
        await page.evaluate((size: number) => {
          const items = document.querySelectorAll('[id^="size-"]');
          for (const item of items) {
            if (item.textContent?.includes(String(size))) {
              (item as HTMLElement).click();
              return;
            }
          }
          if (items.length >= size)
            (items[size - 1] as HTMLElement).click();
        }, params.partySize);
      }
      await delay(800);

      // Date selection (auto-advanced after size)
      const dateDay = parseInt(params.date.slice(6, 8));
      const dateMonth = parseInt(params.date.slice(4, 6));
      await page.evaluate(
        (day: number, month: number) => {
          const months = [
            "",
            "ינואר",
            "פברואר",
            "מרץ",
            "אפריל",
            "מאי",
            "יוני",
            "יולי",
            "אוגוסט",
            "ספטמבר",
            "אוקטובר",
            "נובמבר",
            "דצמבר",
          ];
          const monthName = months[month] || "";
          const items = document.querySelectorAll('[id^="date-"]');
          for (const item of items) {
            const text = item.textContent?.trim() || "";
            if (text.includes(String(day)) && text.includes(monthName)) {
              (item as HTMLElement).click();
              return;
            }
          }
          // Fallback: today
          if (items.length > 0) (items[0] as HTMLElement).click();
        },
        dateDay,
        dateMonth
      );
      await delay(800);

      // Time selection (auto-advanced after date)
      await page.evaluate((targetTime: string) => {
        const items = document.querySelectorAll('[id^="time-"]');
        for (const item of items) {
          const text = item.textContent?.trim() || "";
          if (text.includes(targetTime)) {
            (item as HTMLElement).click();
            return;
          }
        }
        // Fallback: first available time
        if (items.length > 0) (items[0] as HTMLElement).click();
      }, params.time);
      await delay(1000);
    }

    // Click "Find me a table"
    try {
      await page.click(".find-table-btn");
    } catch {
      // Button might not be visible if overlay auto-searched
    }
    console.log("🔍 Ontopo: searching for tables...");

    // Wait for availability results
    await page.waitForSelector(
      ".cursor-pointer.option-height, .availability-area",
      { timeout: 15000 }
    );
    await delay(500);

    // Click the best available time slot (prefer score-1/score-2 = instant confirm)
    // IMPORTANT: must use page.click(), not page.evaluate click (Vue events)
    const targetTime = params.time.replace(":", "");
    const formattedTime = params.time.includes(":") ? params.time : formatTime(params.time);

    // Find the best slot selector
    const slotSelector = await page.evaluate((time: string) => {
      // Prefer score-1 (best), then score-2, then score-3
      for (const score of ["score-1", "score-2", "score-3"]) {
        const slots = document.querySelectorAll(`.${score}.cursor-pointer.option-height`);
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].textContent?.includes(time)) {
            // Add a data attribute so we can click with page.click
            slots[i].setAttribute("data-book-target", "true");
            return `.${score}.cursor-pointer.option-height[data-book-target="true"]`;
          }
        }
      }
      // Fallback: first available slot
      for (const score of ["score-1", "score-2", "score-3"]) {
        const slot = document.querySelector(`.${score}.cursor-pointer.option-height`);
        if (slot) {
          slot.setAttribute("data-book-target", "true");
          return `.${score}.cursor-pointer.option-height[data-book-target="true"]`;
        }
      }
      return null;
    }, formattedTime);

    if (!slotSelector) {
      return buildFallbackMessage("אונטופו", restaurantUrl);
    }

    // Use page.click for proper event handling (navigate to checkout)
    console.log("📝 Ontopo: clicking available slot...");
    const navPromise = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
    await page.click(slotSelector);
    await navPromise;
    await delay(2000);

    console.log(`📝 Ontopo: on checkout page: ${page.url()}`);

    // Dismiss cookie banner immediately on checkout page
    try {
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const b of btns) {
          const text = b.textContent?.trim() || "";
          if (text === "הבנתי" || text === "ACCEPT ALL" || text === "Accept All") {
            (b as HTMLElement).click();
            return;
          }
        }
      });
    } catch {}
    await delay(300);

    // Checkout page on s1.ontopo.com has:
    // Step 1: Terms acceptance ("קראתי ואני מסכים/ה לתנאי השימוש")
    // Step 2: Personal details form
    try {
      // Look for terms checkbox on checkout page
      await page.waitForSelector(
        "input[type='checkbox'], .checkbox-wrap",
        { timeout: 5000 }
      );
      await delay(500);

      // Click the terms checkbox
      try {
        await page.click("input[type='checkbox']");
      } catch {
        await page.click(".checkbox-wrap");
      }
      await delay(300);

      // Click "המשך" (Continue) button - must use page.click for Vue events
      const continueSelector = await page.evaluate(() => {
        const buttons = document.querySelectorAll("button, a, div[role='button']");
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || "";
          if (text === "המשך") {
            btn.setAttribute("data-terms-continue", "true");
            return "[data-terms-continue='true']";
          }
        }
        return null;
      });
      if (continueSelector) {
        await page.click(continueSelector);
      }
      console.log("✅ Ontopo: terms accepted, proceeding to details...");
      await delay(2000);
    } catch {
      console.log("ℹ️ Ontopo: no terms step, going directly to details...");
    }

    // Dismiss cookie banner if present (must happen before form fill)
    try {
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const b of btns) {
          const text = b.textContent?.trim() || "";
          if (text === "הבנתי" || text === "ACCEPT ALL" || text === "Accept All") {
            (b as HTMLElement).click();
            return;
          }
        }
        // Also try clicking cookie banner close button
        const closeBtn = document.querySelector('[class*="cookie"] button, .cookie-banner button');
        if (closeBtn) (closeBtn as HTMLElement).click();
      });
    } catch {}
    await delay(500);

    await safeScreenshot(page, "ontopo-checkout-details");

    // Step 2: Fill personal details using page.type() for Vue.js reactivity
    await page.waitForSelector(
      'input[name="firstName"], input#firstName, input[placeholder*="שם"]',
      { timeout: 10000 }
    );
    await delay(500);

    // Helper: fill input field with Vue.js-compatible event dispatching
    const fillField = async (selectors: string[], value: string, fieldName: string) => {
      for (const sel of selectors) {
        const found = await page.$(sel);
        if (found) {
          // Use page.click for proper Vue focus handling, then clear and type
          await page.click(sel);
          await delay(100);
          // Select all existing text and replace
          await page.keyboard.down("Meta");
          await page.keyboard.press("a");
          await page.keyboard.up("Meta");
          await delay(50);
          await page.type(sel, value, { delay: 30 });
          // Dispatch events for Vue.js reactivity
          await page.evaluate((s: string) => {
            const el = document.querySelector(s) as HTMLInputElement;
            if (el) {
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              el.dispatchEvent(new Event("blur", { bubbles: true }));
            }
          }, sel);
          console.log(`📝 Filled ${fieldName}: "${value}"`);
          return true;
        }
      }
      console.log(`⚠️ Could not find field: ${fieldName}`);
      return false;
    };

    const filledFirst = await fillField(
      ['input#firstName', 'input[name="firstName"]'],
      params.firstName, "firstName"
    );
    await delay(200);
    const filledLast = await fillField(
      ['input#lastName', 'input[name="lastName"]'],
      params.lastName, "lastName"
    );
    await delay(200);
    const filledEmail = await fillField(
      ['input#email', 'input[name="email"]', 'input[type="email"]'],
      params.email, "email"
    );
    await delay(200);
    const filledPhone = await fillField(
      ['input#phone', 'input[name="phone"]', 'input[type="tel"]'],
      params.phone, "phone"
    );
    await delay(500);

    if (!filledFirst || !filledLast || !filledEmail || !filledPhone) {
      console.log("⚠️ Ontopo: some fields could not be filled, trying evaluate fallback...");
      // Fallback: set values directly via evaluate with Vue event dispatch
      await page.evaluate((data: { firstName: string; lastName: string; email: string; phone: string }) => {
        const fields: Record<string, string> = {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        };
        for (const [id, val] of Object.entries(fields)) {
          const el = document.getElementById(id) as HTMLInputElement;
          if (el && !el.value) {
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }, { firstName: params.firstName, lastName: params.lastName, email: params.email, phone: params.phone });
      await delay(500);
    }

    await safeScreenshot(page, "ontopo-form-filled");

    // Click submit/continue button - must use page.click for Vue
    const submitSelector = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button, a, div[role='button']");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (text === "המשך" || text === "הזמנה" || text === "אישור הזמנה") {
          btn.setAttribute("data-submit-target", "true");
          return "[data-submit-target='true']";
        }
      }
      return null;
    });

    if (submitSelector) {
      console.log("📝 Ontopo: clicking submit button...");
      const submitNav = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
      await page.click(submitSelector);
      await submitNav;
    } else {
      console.log("⚠️ Ontopo: could not find submit button");
    }
    console.log("✅ Ontopo: form submitted, waiting for next step...");

    await delay(3000);
    await safeScreenshot(page, "ontopo-after-submit");

    const summary = `מסעדה: ${params.restaurantSlug}\nתאריך: ${formatDate(params.date)}\nשעה: ${params.time}\nסועדים: ${params.partySize}\nעל שם: ${params.firstName} ${params.lastName}`;

    // Check if still on form page (= submission failed)
    let content = await page.content();
    const stillOnForm = content.includes("שם פרטי") && content.includes("שם משפחה") && content.includes("טלפון");
    if (stillOnForm) {
      console.log("⚠️ Ontopo: still on form page after submit - booking likely failed");
      return buildFallbackMessage("אונטופו", `https://ontopo.com/he/il/page/${urlSlug}`);
    }

    // Summary page: has "סיכום הזמנה" and "סיום" button - need to click "סיום" to finalize
    if (content.includes("סיכום") || (content.includes("סיום") && !content.includes("שם פרטי"))) {
      console.log("📝 Ontopo: on summary page, clicking 'סיום' to finalize...");

      // Dismiss ALL popups/tooltips/cookie banners that may block the "סיום" button
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.evaluate(() => {
          const btns = document.querySelectorAll("button, a, span, div[role='button']");
          for (const b of btns) {
            const text = b.textContent?.trim() || "";
            if (text === "הבנתי" || text === "ACCEPT ALL" || text === "Accept All") {
              (b as HTMLElement).click();
            }
          }
          // Also try closing any overlay/tooltip/popover
          const overlays = document.querySelectorAll('[class*="tooltip"] button, [class*="popover"] button, [class*="cookie"] button, [class*="overlay"] button, [class*="modal"] button');
          for (const o of overlays) {
            (o as HTMLElement).click();
          }
        });
        await delay(500);
      }

      await delay(1000);
      await safeScreenshot(page, "ontopo-after-dismiss-popups");

      const finishSelector = await page.evaluate(() => {
        const buttons = document.querySelectorAll("button, a, div[role='button']");
        for (const btn of buttons) {
          const text = btn.textContent?.trim() || "";
          if (text === "סיום") {
            btn.setAttribute("data-finish-target", "true");
            return "[data-finish-target='true']";
          }
        }
        return null;
      });

      if (finishSelector) {
        const finishNav = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
        await page.click(finishSelector);
        await finishNav;
        console.log("✅ Ontopo: clicked 'סיום', waiting for confirmation...");
        await delay(5000);
        await safeScreenshot(page, "ontopo-after-finish");
      } else {
        console.log("⚠️ Ontopo: could not find 'סיום' button");
      }
    }

    // Check for success - look for strong confirmation indicators
    const pageUrl = page.url();
    content = await page.content();
    await safeScreenshot(page, "ontopo-result");

    const isStrongConfirmation =
      pageUrl.includes("confirmation") ||
      pageUrl.includes("success") ||
      content.includes("תודה על הזמנתך") ||
      content.includes("ההזמנה אושרה") ||
      content.includes("reservation confirmed") ||
      content.includes("הזמנה מספר") ||
      content.includes("ההזמנה התקבלה");

    if (isStrongConfirmation) {
      console.log("✅ Ontopo: strong confirmation detected!");
      return `ההזמנה בוצעה בהצלחה! ✅\n${summary}`;
    }

    // Weak signals (like just "תודה" or still on summary page) = NOT confirmed
    const stillOnSummary = content.includes("סיכום הזמנה") || content.includes("טרם השלמתם");
    if (stillOnSummary) {
      console.log("⚠️ Ontopo: still on summary page - booking NOT completed");
      return `לא הצלחתי להשלים את ההזמנה – נתקעתי בדף הסיכום. הזמן ידנית:\nhttps://ontopo.com/he/il/page/${urlSlug}`;
    }

    console.log(`⚠️ Ontopo: unclear state. URL: ${pageUrl}`);
    return `לא הצלחתי לוודא שההזמנה הושלמה. בדוק ידנית:\nhttps://ontopo.com/he/il/page/${urlSlug}\n${summary}`;
  } catch (error: any) {
    console.error("Ontopo booking error:", error.message);
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0)
          await safeScreenshot(pages[pages.length - 1], "ontopo-error");
      } catch {}
    }
    return buildFallbackMessage("אונטופו", `https://ontopo.com/he/il/page/${params.restaurantSlug}`);
  } finally {
    if (browser) await browser.close();
  }
}
