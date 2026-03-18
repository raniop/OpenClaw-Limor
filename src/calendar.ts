import { google } from "googleapis";
import { config } from "./config";

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

export async function createEvent(
  title: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
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
  return event.data.summary || title;
}

export async function listEvents(
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
