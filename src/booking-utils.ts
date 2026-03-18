import puppeteer, { type Browser, type Page } from "puppeteer";
import { writeFileSync } from "fs";

export async function launchBookingBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--lang=he-IL",
    ],
  });
}

export async function fillInput(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.click(selector, { count: 3 }); // select all
  await page.type(selector, value);
}

export async function clearAndType(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    selector,
    value
  );
}

export async function safeScreenshot(
  page: Page,
  label: string
): Promise<string> {
  const path = `/tmp/booking-debug-${label}-${Date.now()}.png`;
  try {
    await page.screenshot({ path, fullPage: true });
    console.log(`📸 Debug screenshot saved: ${path}`);
  } catch (e) {
    console.error(`Failed to take screenshot: ${e}`);
  }
  return path;
}

export function buildFallbackMessage(
  platform: string,
  url: string
): string {
  return `לא הצלחתי להשלים את ההזמנה ב${platform} אוטומטית 😕\nאפשר להזמין ידנית כאן: ${url}`;
}
