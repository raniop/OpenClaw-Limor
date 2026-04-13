/**
 * Calendar module — Apple Calendar (primary) + Google Calendar (fallback).
 * Tries Apple Calendar via AppleScript first. Falls back to Google if Apple fails.
 */
import { google } from "googleapis";
import { config } from "./config";
import { withCircuitBreaker } from "./utils/circuit-breaker";
import {
  appleCreateEvent,
  appleListEvents,
  appleFindAndDeleteEvent,
  appleDeleteAllEventsOnDate,
} from "./calendar-apple";

// ─── Google Calendar (fallback) ───────────────────────────────────────

function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret
  );
  oauth2Client.setCredentials({
    refresh_token: config.googleRefreshToken,
  });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface CreateEventResult {
  eventId: string;
  summary: string;
}

async function googleCreateEvent(
  title: string,
  startDate: Date,
  endDate: Date
): Promise<CreateEventResult> {
  const calendar = getCalendarClient();
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      start: { dateTime: startDate.toISOString(), timeZone: "Asia/Jerusalem" },
      end: { dateTime: endDate.toISOString(), timeZone: "Asia/Jerusalem" },
    },
  });
  return { eventId: event.data.id || "", summary: event.data.summary || title };
}

async function googleDeleteEvent(eventId: string): Promise<string> {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
    return `✅ האירוע נמחק בהצלחה.`;
  } catch (err: any) {
    return `❌ לא הצלחתי למחוק: ${err.message}`;
  }
}

async function googleFindAndDeleteEvent(date: Date, titleQuery: string): Promise<string> {
  const calendar = getCalendarClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = res.data.items;
  if (!events || events.length === 0) return "❌ לא נמצאו אירועים ביום הזה.";

  const query = titleQuery.toLowerCase();
  const matching = events.filter((e) => e.summary?.toLowerCase().includes(query));

  if (matching.length === 0) {
    const available = events.map((e) => `• ${e.summary}`).join("\n");
    return `❌ לא נמצא אירוע שמתאים ל-"${titleQuery}". אירועים ביום הזה:\n${available}`;
  }

  const results: string[] = [];
  for (const event of matching) {
    if (event.id) {
      await calendar.events.delete({ calendarId: "primary", eventId: event.id });
      const time = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : "כל היום";
      results.push(`✅ נמחק: ${time} - ${event.summary}`);
    }
  }
  return results.join("\n");
}

async function googleDeleteAllEventsOnDate(date: Date): Promise<string> {
  const calendar = getCalendarClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
  });

  const events = res.data.items;
  if (!events || events.length === 0) return "אין אירועים ביום הזה.";

  const results: string[] = [];
  for (const event of events) {
    if (event.id) {
      await calendar.events.delete({ calendarId: "primary", eventId: event.id });
      results.push(`✅ נמחק: ${event.summary}`);
    }
  }
  return results.join("\n");
}

async function googleListEvents(date: Date): Promise<string> {
  const calendar = getCalendarClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
  });

  const events = res.data.items;
  if (!events || events.length === 0) return "אין אירועים ביומן ליום הזה.";

  return events
    .map((e) => {
      const start = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
        : "כל היום";
      return `• ${start} - ${e.summary}`;
    })
    .join("\n");
}

// ─── Apple-first with Google fallback ─────────────────────────────────

const googleBreaker = { name: "google-calendar", failureThreshold: 3, cooldownMs: 300_000 };
const GOOGLE_FALLBACK = "❌ גם Apple Calendar וגם Google Calendar לא זמינים כרגע.";

export async function createEvent(
  title: string,
  startDate: Date,
  endDate: Date,
): Promise<CreateEventResult> {
  try {
    return await appleCreateEvent(title, startDate, endDate);
  } catch (err: any) {
    console.warn(`[calendar] Apple Calendar failed: ${err.message}. Trying Google...`);
    return withCircuitBreaker(googleBreaker, () => googleCreateEvent(title, startDate, endDate), GOOGLE_FALLBACK as any);
  }
}

export async function listEvents(date: Date): Promise<string> {
  try {
    return await appleListEvents(date);
  } catch (err: any) {
    console.warn(`[calendar] Apple Calendar failed: ${err.message}. Trying Google...`);
    return withCircuitBreaker(googleBreaker, () => googleListEvents(date), GOOGLE_FALLBACK);
  }
}

export async function findAndDeleteEvent(date: Date, titleQuery: string): Promise<string> {
  try {
    return await appleFindAndDeleteEvent(date, titleQuery);
  } catch (err: any) {
    console.warn(`[calendar] Apple Calendar failed: ${err.message}. Trying Google...`);
    return withCircuitBreaker(googleBreaker, () => googleFindAndDeleteEvent(date, titleQuery), GOOGLE_FALLBACK);
  }
}

export async function deleteAllEventsOnDate(date: Date): Promise<string> {
  try {
    return await appleDeleteAllEventsOnDate(date);
  } catch (err: any) {
    console.warn(`[calendar] Apple Calendar failed: ${err.message}. Trying Google...`);
    return withCircuitBreaker(googleBreaker, () => googleDeleteAllEventsOnDate(date), GOOGLE_FALLBACK);
  }
}

export async function deleteEvent(eventId: string): Promise<string> {
  // deleteEvent by ID only works with Google (Apple uses UID differently)
  return withCircuitBreaker(googleBreaker, () => googleDeleteEvent(eventId), GOOGLE_FALLBACK);
}
