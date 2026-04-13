/**
 * Insurance handler — fetches policies from הר הביטוח via Puppeteer scraper.
 * Two-phase flow: phase 1 triggers OTP, phase 2 enters OTP and scrapes.
 */
import { config } from "../../config";
import { harbLoginPhase1, harbLoginPhase2 } from "../../harb";
import type { Browser, Page } from "puppeteer";
import type { ToolHandler } from "./types";

// In-memory session — kept alive between tool calls for OTP flow
let pendingSession: { browser: Browser; page: Page; createdAt: number } | null = null;

// Auto-cleanup after 3 minutes (OTP expires)
const SESSION_TIMEOUT = 3 * 60 * 1000;

function cleanupSession(): void {
  if (pendingSession) {
    pendingSession.browser.close().catch(() => {});
    pendingSession = null;
  }
}

export const insuranceHandlers: Record<string, ToolHandler> = {
  fetch_insurance_policies: async (input) => {
    const idNumber = process.env.HARB_ID_NUMBER;
    const password = process.env.HARB_PASSWORD;

    if (!idNumber || !password) {
      return "❌ חסרים פרטי הזדהות להר הביטוח. צריך להגדיר HARB_ID_NUMBER ו-HARB_PASSWORD ב-.env";
    }

    // Phase 2: OTP provided — continue with existing session
    if (input.otp_code && pendingSession) {
      // Check timeout
      if (Date.now() - pendingSession.createdAt > SESSION_TIMEOUT) {
        cleanupSession();
        return "❌ פג תוקף הקוד. תתחיל את התהליך מחדש.";
      }

      const { browser, page } = pendingSession;
      pendingSession = null; // Clear session before use

      const result = await harbLoginPhase2(browser, page, input.otp_code);

      if (!result.success) {
        return `❌ ${result.error}`;
      }

      if (!result.policies || result.policies.length === 0) {
        return "📋 לא נמצאו פוליסות ביטוח בהר הביטוח.";
      }

      // Format policies
      const lines = result.policies.map((p, i) => {
        const parts = [`${i + 1}. **${p.type || "ביטוח"}**`];
        if (p.company) parts.push(`   🏢 חברה: ${p.company}`);
        if (p.policyNumber) parts.push(`   📄 מספר פוליסה: ${p.policyNumber}`);
        if (p.branch) parts.push(`   🏷️ ענף: ${p.branch}`);
        if (p.startDate) parts.push(`   📅 תחילה: ${p.startDate}`);
        if (p.endDate) parts.push(`   📅 סיום: ${p.endDate}`);
        if (p.premium) parts.push(`   💰 פרמיה: ${p.premium}`);
        if (p.status) parts.push(`   ✅ סטטוס: ${p.status}`);
        return parts.join("\n");
      });

      return `📋 *פוליסות ביטוח מהר הביטוח* (${result.policies.length}):\n\n${lines.join("\n\n")}`;
    }

    // Phase 1: Start login — trigger OTP
    cleanupSession(); // Clean any stale session

    const phase1 = await harbLoginPhase1(idNumber, password);

    if ("error" in phase1) {
      return `❌ ${phase1.error}`;
    }

    // Save session for phase 2
    pendingSession = {
      browser: phase1.browser,
      page: phase1.page,
      createdAt: Date.now(),
    };

    // Auto-cleanup timeout
    setTimeout(cleanupSession, SESSION_TIMEOUT);

    return "📱 שלחתי קוד OTP ב-SMS לטלפון שלך. מה הקוד שקיבלת? (יש לך 3 דקות)";
  },
};
