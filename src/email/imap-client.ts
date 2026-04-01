/**
 * IMAP Client — manages connection to iCloud Mail via IMAP.
 * Connect-per-operation: opens a fresh connection for each operation.
 * Uses SEARCH + sequence-based FETCH (iCloud requires this pattern).
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { config } from "../config";
import type { ParsedEmail, EmailSearchQuery } from "./email-types";

const ICLOUD_HOST = "imap.mail.me.com";
const ICLOUD_PORT = 993;
const FETCH_DELAY_MS = 500;

function isConfigured(): boolean {
  return !!(config.icloudImapEmail && config.icloudImapPassword);
}

export function isImapConfigured(): boolean {
  return isConfigured();
}

export function isImapConnected(): boolean {
  return isConfigured();
}

export async function connectImap(): Promise<void> {
  if (!isConfigured()) return;
  const c = createClient();
  try {
    await c.connect();
    console.log(`[email] Connected to iCloud IMAP (${config.icloudImapEmail})`);
    await c.logout();
  } catch (err: any) {
    console.error("[email] IMAP connect failed:", err.message);
    throw err;
  }
}

export async function disconnectImap(): Promise<void> {}

function createClient(): ImapFlow {
  return new ImapFlow({
    host: ICLOUD_HOST,
    port: ICLOUD_PORT,
    secure: true,
    auth: {
      user: config.icloudImapEmail,
      pass: config.icloudImapPassword,
    },
    logger: false,
    emitLogs: false,
  });
}

async function withConnection<T>(
  op: string,
  fn: (client: ImapFlow) => Promise<T>,
  fallback: T
): Promise<T> {
  if (!isConfigured()) return fallback;
  const client = createClient();
  try {
    await client.connect();
    const result = await fn(client);
    return result;
  } catch (err: any) {
    console.error(`[email] ${op} error:`, err.message);
    return fallback;
  } finally {
    try { await client.logout(); } catch {}
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseMessage(
  source: Buffer | undefined,
  uid: number
): Promise<ParsedEmail | null> {
  if (!source) return null;
  const parsed: ParsedMail = await simpleParser(source) as ParsedMail;
  const fromAddr = parsed.from?.value?.[0]?.address || "";
  const fromName = parsed.from?.value?.[0]?.name || fromAddr;
  const textBody = (parsed.text || "").substring(0, 2000);

  return {
    uid,
    messageId: parsed.messageId || `uid-${uid}`,
    from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
    fromAddress: fromAddr,
    to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t: any) => t.text).join(", ") : (parsed.to as any).text || "") : "",
    subject: parsed.subject || "(ללא נושא)",
    date: parsed.date?.toISOString() || new Date().toISOString(),
    textBody,
    snippet: textBody.substring(0, 200).replace(/\n/g, " "),
  };
}

/**
 * Get the current latest UID in INBOX.
 */
export async function getLatestUid(): Promise<number> {
  return withConnection("getLatestUid", async (client) => {
    let lock;
    try {
      lock = await client.getMailboxLock("INBOX");
      const mb = client.mailbox;
      if (!mb) return 0;
      return Number((mb as any).uidNext || 1) - 1;
    } finally {
      lock?.release();
    }
  }, 0);
}

/**
 * Fetch emails with UID greater than sinceUid.
 * Uses SEARCH to find UIDs, then sequence-based FETCH.
 */
export async function fetchEmailsSinceUid(
  sinceUid: number,
  limit: number = 50
): Promise<ParsedEmail[]> {
  return withConnection("fetchEmailsSinceUid", async (client) => {
    let lock;
    try {
      lock = await client.getMailboxLock("INBOX");

      // Search for messages with UID > sinceUid
      const searchResult = await client.search({ uid: `${sinceUid + 1}:*` }, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      if (uids.length === 0) return [];

      // Take up to limit, most recent
      const selected = uids.slice(-limit);
      const results: ParsedEmail[] = [];

      for (const uid of selected) {
        try {
          // Use UID FETCH via search-found UIDs — fetch by sequence after mapping
          const fetchResult = client.fetch({ uid }, { uid: true, source: true });
          for await (const msg of fetchResult) {
            const email = await parseMessage(msg.source, msg.uid);
            if (email) results.push(email);
          }
        } catch (parseErr: any) {
          console.error(`[email] Failed to fetch UID ${uid}:`, parseErr.message);
        }
        await delay(FETCH_DELAY_MS);
      }

      return results;
    } finally {
      lock?.release();
    }
  }, []);
}

/**
 * Search emails by keyword, sender, and/or date range.
 */
export async function searchEmails(
  query: EmailSearchQuery
): Promise<ParsedEmail[]> {
  return withConnection("searchEmails", async (client) => {
    let lock;
    try {
      lock = await client.getMailboxLock("INBOX");

      const criteria: any = {};
      if (query.keyword) criteria.or = [{ subject: query.keyword }, { body: query.keyword }];
      if (query.from) criteria.from = query.from;
      if (query.since) criteria.since = query.since;
      if (query.before) criteria.before = query.before;

      const searchResult = await client.search(criteria, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      if (uids.length === 0) return [];

      const limit = query.limit || 10;
      const selected = uids.slice(-limit);
      const results: ParsedEmail[] = [];

      for (const uid of selected) {
        try {
          for await (const msg of client.fetch({ uid }, { uid: true, source: true })) {
            const email = await parseMessage(msg.source, msg.uid);
            if (email) results.push(email);
          }
        } catch (parseErr: any) {
          console.error(`[email] Failed to fetch search UID ${uid}:`, parseErr.message);
        }
        await delay(FETCH_DELAY_MS);
      }

      return results;
    } finally {
      lock?.release();
    }
  }, []);
}

/**
 * Fetch recent emails (last N hours).
 */
export async function fetchRecentEmails(
  hours: number = 24,
  limit: number = 15
): Promise<ParsedEmail[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return searchEmails({ since, limit });
}
