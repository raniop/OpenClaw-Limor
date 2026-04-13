/**
 * הר הביטוח (harb.cma.gov.il) scraper.
 * Logs in via מערכת ההזדהות הלאומית (login.gov.il), then scrapes insurance policies.
 * Requires OTP from user mid-flow — uses a callback pattern.
 */
import puppeteer, { type Browser, type Page } from "puppeteer";
import { writeFileSync } from "fs";

const HARB_URL = "https://harb.cma.gov.il";
const LOGIN_BUTTON_HREF = "/sso/Overview";
const TIMEOUT = 30000;

export interface InsurancePolicy {
  type: string;         // ביטוח חיים, בריאות, רכב, etc.
  company: string;      // חברת הביטוח
  policyNumber: string;
  startDate: string;
  endDate: string;
  premium: string;      // פרמיה
  status: string;       // פעיל/לא פעיל
  branch: string;       // ענף
}

export interface HarbResult {
  success: boolean;
  policies?: InsurancePolicy[];
  error?: string;
  screenshot?: string;  // path to debug screenshot
}

async function launchStealthBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: "new" as any,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,900",
      "--lang=he-IL",
      "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    ],
  });
}

function screenshot(page: Page, name: string): Promise<void> {
  return page.screenshot({ path: `/tmp/harb_${name}.png` }).then(() => {
    console.log(`[harb] Screenshot: /tmp/harb_${name}.png`);
  }).catch(() => {});
}

/**
 * Phase 1: Login with ID + password, trigger OTP.
 * Returns the browser and page (kept open for phase 2).
 */
export async function harbLoginPhase1(
  idNumber: string,
  password: string,
): Promise<{ browser: Browser; page: Page } | { error: string }> {
  let browser: Browser | null = null;
  try {
    browser = await launchStealthBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    // Navigate to הר הביטוח
    console.log("[harb] Navigating to harb.cma.gov.il...");
    await page.goto(HARB_URL, { waitUntil: "networkidle2", timeout: TIMEOUT });

    // Click "כניסה למבוטחים"
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const btn = links.find((el) => el.textContent?.includes("כניסה למבוטחים"));
      if (btn) btn.click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: TIMEOUT }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    // Wait for login form
    await page.waitForSelector("#userId", { timeout: TIMEOUT });
    await screenshot(page, "login_form");

    // Enter credentials
    await page.type("#userId", idNumber);
    await page.type("#userPass", password);
    console.log("[harb] Credentials entered, submitting...");

    // Click login
    await page.click("#loginSubmit");
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "after_login_click");

    // Check what happened — OTP page? Error? Dashboard?
    const pageContent = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || "");

    // Check for error
    if (pageContent.includes("שגיאה") || pageContent.includes("אינם תקינים") || pageContent.includes("שגוי")) {
      await screenshot(page, "login_error");
      await browser.close();
      return { error: "שם משתמש או סיסמה שגויים. בדוק את הפרטים ב-.env" };
    }

    // Check for OTP input
    const hasOtpField = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      return inputs.some((i) =>
        i.type === "tel" || i.type === "number" ||
        i.id?.includes("otp") || i.id?.includes("code") || i.id?.includes("sms") ||
        i.placeholder?.includes("קוד") || i.placeholder?.includes("SMS")
      );
    });

    if (hasOtpField) {
      console.log("[harb] OTP page detected — waiting for user to provide code");
      return { browser, page };
    }

    // Maybe we landed on the dashboard directly (unlikely but possible)
    if (pageContent.includes("פוליס") || pageContent.includes("ביטוח") || pageContent.includes("הר הביטוח")) {
      console.log("[harb] Landed directly on dashboard (no OTP needed)");
      return { browser, page };
    }

    // Unknown state
    await screenshot(page, "unknown_state");
    console.log("[harb] Unknown page state after login:", pageContent.substring(0, 200));
    return { browser, page };

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return { error: `שגיאה בהתחברות: ${(err as any).message}` };
  }
}

/**
 * Phase 2: Enter OTP and scrape policies.
 */
export async function harbLoginPhase2(
  browser: Browser,
  page: Page,
  otpCode: string,
): Promise<HarbResult> {
  try {
    // Find and fill OTP input
    const otpSelector = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"));
      for (const i of inputs) {
        if (i.type === "tel" || i.type === "number" || i.type === "text") {
          if (i.id?.includes("otp") || i.id?.includes("code") || i.id?.includes("sms") ||
            i.placeholder?.includes("קוד") || i.placeholder?.includes("SMS") ||
            !i.value) {
            return `#${i.id}` || `input[type="${i.type}"]`;
          }
        }
      }
      // Fallback — find any visible empty input
      const visible = inputs.filter((i) => i.offsetParent !== null && !i.value && i.type !== "hidden");
      if (visible.length > 0) return `#${visible[0].id}` || "input:not([type=hidden])";
      return null;
    });

    if (!otpSelector) {
      await screenshot(page, "no_otp_field");
      await browser.close();
      return { success: false, error: "לא מצאתי שדה להזנת קוד OTP" };
    }

    console.log(`[harb] Entering OTP in ${otpSelector}...`);
    await page.type(otpSelector, otpCode);

    // Find and click submit/verify button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, input[type=submit]"));
      const submitBtn = buttons.find((b) =>
        b.textContent?.includes("אימות") || b.textContent?.includes("כניסה") ||
        b.textContent?.includes("אישור") || b.textContent?.includes("המשך") ||
        b.textContent?.includes("שלח")
      );
      if (submitBtn) (submitBtn as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "after_otp");

    // Wait for redirect to harb dashboard
    try {
      await page.waitForFunction(
        () => window.location.hostname === "harb.cma.gov.il",
        { timeout: 15000 },
      );
    } catch {
      // Maybe we're already there or it's a different flow
    }

    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "dashboard");

    // Scrape the policies
    const policies = await scrapePolicies(page);

    await browser.close();

    if (policies.length === 0) {
      return { success: true, policies: [], error: "לא נמצאו פוליסות ביטוח" };
    }

    return { success: true, policies };

  } catch (err) {
    await screenshot(page, "phase2_error").catch(() => {});
    await browser.close().catch(() => {});
    return { success: false, error: `שגיאה בשלב ה-OTP: ${(err as any).message}` };
  }
}

/**
 * Scrape insurance policies from the dashboard page.
 * First navigates to "כל הביטוחים" to get the full policy table.
 */
async function scrapePolicies(page: Page): Promise<InsurancePolicy[]> {
  await screenshot(page, "scrape_start");

  // Find and click "כל הביטוחים" — it's inside the circular diagram on the dashboard
  console.log("[harb] Looking for 'כל הביטוחים' link...");

  // First, collect all links and their hrefs for debugging
  const allLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => ({
      text: a.textContent?.trim().substring(0, 60),
      href: a.getAttribute("href"),
    })).filter((l) => l.text && l.text.length > 1);
  });
  console.log("[harb] All links on page:", JSON.stringify(allLinks));

  // Try clicking "כל הביטוחים" link
  const clickResult = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    const allInsBtn = links.find((a) =>
      a.textContent?.trim().includes("כל הביטוחים")
    );
    if (allInsBtn) {
      const href = allInsBtn.getAttribute("href");
      allInsBtn.click();
      return { clicked: true, href };
    }
    // Try any element with that text
    const allEls = Array.from(document.querySelectorAll("*"));
    const el = allEls.find((e) =>
      e.textContent?.trim() === "כל הביטוחים" && e.children.length === 0
    );
    if (el) {
      (el as HTMLElement).click();
      return { clicked: true, href: "element-click" };
    }
    return { clicked: false, href: null };
  });
  console.log("[harb] Click result:", JSON.stringify(clickResult));

  if (clickResult.clicked) {
    // Wait for navigation or content change
    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {}),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "all_policies_page");
    console.log("[harb] After clicking, URL:", page.url());
  } else {
    // Try navigating directly to common policy list URLs
    const currentUrl = page.url();
    const basePath = currentUrl.replace(/\/[^/]*$/, "");
    for (const path of ["/AllPolicies", "/Policies", "/sso/AllPolicies", "/sso/Policies"]) {
      try {
        console.log(`[harb] Trying ${basePath}${path}...`);
        await page.goto(`https://harb.cma.gov.il${path}`, { waitUntil: "networkidle2", timeout: 10000 });
        const text = await page.evaluate(() => document.body?.innerText?.substring(0, 200));
        if (text && !text.includes("404") && !text.includes("Error")) {
          console.log("[harb] Found policies page at", path);
          break;
        }
      } catch {}
    }
    await screenshot(page, "all_policies_page");
  }

  // Wait for table to load
  await new Promise((r) => setTimeout(r, 2000));

  // Log the page structure for debugging
  const pageText = await page.evaluate(() => document.body?.innerText || "");
  console.log("[harb] Page text (first 800 chars):", pageText.substring(0, 800));

  // Find the RIGHT table — skip contact info tables (phone/email)
  const tableInfo = await page.evaluate(() => {
    const tables = document.querySelectorAll("table");
    const results: Array<{ index: number; headers: string[]; rowCount: number }> = [];
    tables.forEach((table, idx) => {
      const ths = table.querySelectorAll("th");
      const headers = Array.from(ths).map((th) => th.textContent?.trim() || "");
      const rows = table.querySelectorAll("tbody tr, tr:not(:first-child)");
      results.push({ index: idx, headers, rowCount: rows.length });
    });
    return results;
  });
  console.log("[harb] All tables found:", JSON.stringify(tableInfo));

  // Pick the policy table (skip contact-info tables that have "טלפון" or "דוא"ל" headers)
  const policyTable = tableInfo.find((t) =>
    t.headers.length >= 3 &&
    !t.headers.some((h) => h.includes("טלפון") || h.includes("דוא")) &&
    (t.headers.some((h) => h.includes("פוליס") || h.includes("ענף") || h.includes("חברה") || h.includes("פרמי") || h.includes("תוקף")))
  );

  const headers = policyTable?.headers || [];
  const tableIndex = policyTable?.index ?? -1;
  console.log("[harb] Selected table index:", tableIndex, "headers:", JSON.stringify(headers));

  // Scrape all table rows with smart column mapping
  const policies = await page.evaluate((headerTexts: string[], tblIndex: number) => {
    const results: any[] = [];

    // Build column index map from headers
    const colMap: Record<string, number> = {};
    for (let i = 0; i < headerTexts.length; i++) {
      const h = headerTexts[i];
      if (h.includes("ענף") || h.includes("סוג")) colMap.type = i;
      else if (h.includes("חברה") || h.includes("מבטח")) colMap.company = i;
      else if (h.includes("מספר") && (h.includes("פוליסה") || h.includes("פוליס"))) colMap.policyNumber = i;
      else if (h.includes("תחילה") || h.includes("התחלה") || h.includes("מתאריך")) colMap.startDate = i;
      else if (h.includes("סיום") || h.includes("עד תאריך") || h.includes("תוקף")) colMap.endDate = i;
      else if (h.includes("פרמי") || h.includes("תשלום") || h.includes("עלות")) colMap.premium = i;
      else if (h.includes("סטטוס") || h.includes("מצב") || h.includes("פעיל")) colMap.status = i;
    }

    // Select from the specific table if we found one, otherwise fall back to all tables
    const targetTable = tblIndex >= 0 ? document.querySelectorAll("table")[tblIndex] : null;
    const rows = targetTable
      ? targetTable.querySelectorAll("tbody tr, tr:not(:first-child)")
      : document.querySelectorAll("table tbody tr, table tr:not(:first-child)");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 3) continue;
      const texts = Array.from(cells).map((c) => c.textContent?.trim() || "");

      results.push({
        type: texts[colMap.type ?? 0] || "",
        company: texts[colMap.company ?? 1] || "",
        policyNumber: texts[colMap.policyNumber ?? 2] || "",
        startDate: texts[colMap.startDate ?? 3] || "",
        endDate: texts[colMap.endDate ?? 4] || "",
        premium: texts[colMap.premium ?? 5] || "",
        status: texts[colMap.status ?? 6] || "",
        branch: "",
      });
    }

    // If no table rows found, try card/list layout
    if (results.length === 0) {
      const cards = document.querySelectorAll("[class*=card], [class*=policy], [class*=item], .row, .panel");
      for (const card of cards) {
        const text = card.textContent?.trim() || "";
        if (text.length > 20 && (text.includes("פוליס") || text.includes("ביטוח") || text.includes("פרמי"))) {
          // Try to extract labeled fields
          const getField = (label: string) => {
            const regex = new RegExp(label + "[:\\s]*([^\\n,]+)");
            const match = text.match(regex);
            return match?.[1]?.trim() || "";
          };
          results.push({
            type: getField("ענף|סוג ביטוח|סוג"),
            company: getField("חברה|חברת ביטוח|מבטח"),
            policyNumber: getField("מספר פוליסה|מס. פוליסה|מספר"),
            startDate: getField("תחילה|מתאריך|התחלה"),
            endDate: getField("סיום|עד תאריך|תוקף"),
            premium: getField("פרמי|תשלום|עלות"),
            status: getField("סטטוס|מצב"),
            branch: "",
          });
        }
      }
    }

    return results;
  }, headers, tableIndex);

  console.log(`[harb] Found ${policies.length} policies`);
  // Log first policy for debugging
  if (policies.length > 0) {
    console.log("[harb] First policy:", JSON.stringify(policies[0]));
  }
  return policies;
}

/**
 * One-shot: login + OTP + scrape (for testing from CLI).
 */
export async function fetchInsurancePolicies(
  idNumber: string,
  password: string,
  otpCode: string,
): Promise<HarbResult> {
  const phase1 = await harbLoginPhase1(idNumber, password);
  if ("error" in phase1) return { success: false, error: phase1.error };

  return harbLoginPhase2(phase1.browser, phase1.page, otpCode);
}
