/**
 * Apple Calendar integration via AppleScript (macOS only).
 * Primary calendar provider — faster and more reliable than Google on a Mac.
 */
import { execSync } from "child_process";
import type { CreateEventResult } from "./calendar";

const CALENDAR_NAME = process.env.APPLE_CALENDAR_NAME || "Home";
const TIMEOUT = 15000; // 15s timeout for AppleScript

function runAppleScript(script: string): string {
  // Escape single quotes in the script for shell
  const escaped = script.replace(/'/g, "'\\''");
  return execSync(`osascript -e '${escaped}'`, { timeout: TIMEOUT }).toString().trim();
}

/**
 * Format a JS Date to AppleScript-compatible date string.
 * AppleScript needs: "Saturday, April 12, 2026 at 10:00:00 AM"
 */
function formatDateForAppleScript(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export async function appleCreateEvent(
  title: string,
  startDate: Date,
  endDate: Date,
): Promise<CreateEventResult> {
  const startStr = formatDateForAppleScript(startDate);
  const endStr = formatDateForAppleScript(endDate);
  // Escape double quotes in title
  const safeTitle = title.replace(/"/g, '\\"');

  const script = `
tell application "Calendar"
  tell calendar "${CALENDAR_NAME}"
    set newEvent to make new event at end with properties {summary:"${safeTitle}", start date:date "${startStr}", end date:date "${endStr}"}
    return uid of newEvent
  end tell
end tell`;

  const uid = runAppleScript(script);
  console.log(`[apple-calendar] Created event "${title}" → uid=${uid}`);
  return { eventId: uid, summary: title };
}

export async function appleListEvents(date: Date): Promise<string> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startStr = formatDateForAppleScript(startOfDay);
  const endStr = formatDateForAppleScript(endOfDay);

  // Get events from ALL calendars (not just Home)
  const script = `
tell application "Calendar"
  set eventList to {}
  repeat with cal in calendars
    try
      set calEvents to (every event of cal whose start date >= date "${startStr}" and start date <= date "${endStr}")
      repeat with evt in calEvents
        set eventInfo to (summary of evt) & "|||" & (start date of evt as string) & "|||" & (end date of evt as string) & "|||" & (name of cal)
        set end of eventList to eventInfo
      end repeat
    end try
  end repeat
  set AppleScript's text item delimiters to "\\n"
  return eventList as text
end tell`;

  const output = runAppleScript(script);

  if (!output || output.trim() === "") {
    return "אין אירועים ביומן ליום הזה.";
  }

  const lines = output.split("\n").filter((l) => l.trim());
  const events = lines.map((line) => {
    const parts = line.split("|||");
    const title = parts[0] || "";
    const startRaw = parts[1] || "";
    const calName = parts[3] || "";

    // Parse the date for display
    let timeStr = "כל היום";
    try {
      const d = new Date(startRaw);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      }
    } catch {}

    const calLabel = calName && calName !== CALENDAR_NAME ? ` [${calName}]` : "";
    return `• ${timeStr} - ${title}${calLabel}`;
  });

  // Sort by time
  events.sort();
  return events.join("\n");
}

export async function appleFindAndDeleteEvent(
  date: Date,
  titleQuery: string,
): Promise<string> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startStr = formatDateForAppleScript(startOfDay);
  const endStr = formatDateForAppleScript(endOfDay);
  const safeQuery = titleQuery.replace(/"/g, '\\"');

  // First list events to find matches
  const listScript = `
tell application "Calendar"
  set results to {}
  tell calendar "${CALENDAR_NAME}"
    set dayEvents to (every event whose start date >= date "${startStr}" and start date <= date "${endStr}")
    repeat with evt in dayEvents
      set end of results to (summary of evt) & "|||" & (uid of evt) & "|||" & (start date of evt as string)
    end repeat
  end tell
  set AppleScript's text item delimiters to "\\n"
  return results as text
end tell`;

  const output = runAppleScript(listScript);
  if (!output.trim()) return "❌ לא נמצאו אירועים ביום הזה.";

  const lines = output.split("\n").filter((l) => l.trim());
  const query = titleQuery.toLowerCase();
  const matching = lines.filter((l) => l.toLowerCase().includes(query));

  if (matching.length === 0) {
    const available = lines.map((l) => `• ${l.split("|||")[0]}`).join("\n");
    return `❌ לא נמצא אירוע שמתאים ל-"${titleQuery}". אירועים ביום הזה:\n${available}`;
  }

  // Delete matching events
  const results: string[] = [];
  for (const line of matching) {
    const parts = line.split("|||");
    const summary = parts[0];
    const uid = parts[1];
    try {
      const deleteScript = `
tell application "Calendar"
  tell calendar "${CALENDAR_NAME}"
    delete (every event whose uid is "${uid}")
  end tell
end tell`;
      runAppleScript(deleteScript);
      results.push(`✅ נמחק: ${summary}`);
    } catch {
      results.push(`❌ לא הצלחתי למחוק: ${summary}`);
    }
  }

  return results.join("\n");
}

export async function appleDeleteAllEventsOnDate(date: Date): Promise<string> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startStr = formatDateForAppleScript(startOfDay);
  const endStr = formatDateForAppleScript(endOfDay);

  const script = `
tell application "Calendar"
  tell calendar "${CALENDAR_NAME}"
    set dayEvents to (every event whose start date >= date "${startStr}" and start date <= date "${endStr}")
    set eventCount to count of dayEvents
    if eventCount = 0 then return "אין אירועים ביום הזה."
    set deletedNames to {}
    repeat with evt in dayEvents
      set end of deletedNames to summary of evt
      delete evt
    end repeat
    set AppleScript's text item delimiters to ", "
    return "נמחקו " & eventCount & " אירועים: " & (deletedNames as text)
  end tell
end tell`;

  return runAppleScript(script);
}

export async function appleListCalendars(): Promise<string[]> {
  const output = runAppleScript(`
tell application "Calendar"
  set calNames to {}
  repeat with cal in calendars
    set end of calNames to name of cal
  end repeat
  set AppleScript's text item delimiters to "|||"
  return calNames as text
end tell`);
  return output.split("|||").map((s) => s.trim()).filter(Boolean);
}
