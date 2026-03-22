import { google } from "googleapis";
import { config } from "./config";
import { withCircuitBreaker } from "./utils/circuit-breaker";

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

async function _createEvent(
  title: string,
  startDate: Date,
  endDate: Date
): Promise<CreateEventResult> {
  const calendar = getCalendarClient();
  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      start: {
        dateTime: startDate.toISOString(),
        timeZone: "Asia/Jerusalem",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "Asia/Jerusalem",
      },
    },
  });
  return {
    eventId: event.data.id || "",
    summary: event.data.summary || title,
  };
}

async function _deleteEvent(eventId: string): Promise<string> {
  const calendar = getCalendarClient();
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });
    return `✅ האירוע נמחק בהצלחה.`;
  } catch (err: any) {
    return `❌ לא הצלחתי למחוק: ${err.message}`;
  }
}

async function _findAndDeleteEvent(date: Date, titleQuery: string): Promise<string> {
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
  if (!events || events.length === 0) {
    return "❌ לא נמצאו אירועים ביום הזה.";
  }

  // Find matching events by title
  const query = titleQuery.toLowerCase();
  const matching = events.filter(e =>
    e.summary?.toLowerCase().includes(query)
  );

  if (matching.length === 0) {
    const available = events.map(e => `• ${e.summary}`).join("\n");
    return `❌ לא נמצא אירוע שמתאים ל-"${titleQuery}". אירועים ביום הזה:\n${available}`;
  }

  // Delete all matching
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

async function _deleteAllEventsOnDate(date: Date): Promise<string> {
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
  if (!events || events.length === 0) {
    return "אין אירועים ביום הזה.";
  }

  const results: string[] = [];
  for (const event of events) {
    if (event.id) {
      await calendar.events.delete({ calendarId: "primary", eventId: event.id });
      results.push(`✅ נמחק: ${event.summary}`);
    }
  }

  return results.join("\n");
}

async function _listEvents(
  date: Date
): Promise<string> {
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
  if (!events || events.length === 0) {
    return "אין אירועים ביומן ליום הזה.";
  }

  return events
    .map((e) => {
      const start = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "כל היום";
      return `• ${start} - ${e.summary}`;
    })
    .join("\n");
}

// --- Circuit breaker wrappers ---
const calendarBreaker = { name: "google-calendar", failureThreshold: 3, cooldownMs: 300_000 };
const CALENDAR_FALLBACK = "❌ Google Calendar לא זמין כרגע. נסה שוב.";

export async function createEvent(title: string, startDate: Date, endDate: Date): Promise<CreateEventResult> {
  return withCircuitBreaker(calendarBreaker, () => _createEvent(title, startDate, endDate), CALENDAR_FALLBACK as any);
}
export function deleteEvent(eventId: string): Promise<string> {
  return withCircuitBreaker(calendarBreaker, () => _deleteEvent(eventId), CALENDAR_FALLBACK);
}
export function findAndDeleteEvent(date: Date, titleQuery: string): Promise<string> {
  return withCircuitBreaker(calendarBreaker, () => _findAndDeleteEvent(date, titleQuery), CALENDAR_FALLBACK);
}
export function deleteAllEventsOnDate(date: Date): Promise<string> {
  return withCircuitBreaker(calendarBreaker, () => _deleteAllEventsOnDate(date), CALENDAR_FALLBACK);
}
export function listEvents(date: Date): Promise<string> {
  return withCircuitBreaker(calendarBreaker, () => _listEvents(date), CALENDAR_FALLBACK);
}
