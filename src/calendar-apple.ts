/**
 * Apple Calendar integration via AppleScript (macOS only).
 * Primary calendar provider — faster and more reliable than Google on a Mac.
 */
import { execSync } from "child_process";
import type { CreateEventResult } from "./calendar";

const CALENDAR_NAME = process.env.APPLE_CALENDAR_NAME || "Home";
const TIMEOUT = 15000; // 15s timeout for AppleScript

function runAppleScript(script: string): string {
  // Write to temp file to avoid shell escaping issues with AppleScript's quotes
  const tmpFile = `/tmp/harb_applescript_${Date.now()}.scpt`;
  const { writeFileSync, unlinkSync } = require("fs");
  try {
    writeFileSync(tmpFile, script, "utf-8");
    const result = execSync(`osascript "${tmpFile}"`, { timeout: TIMEOUT }).toString().trim();
    try { unlinkSync(tmpFile); } catch {}
    return result;
  } catch (err) {
    try { unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

/**
 * Build AppleScript code that constructs a date object from components.
 * Avoids locale-dependent date string parsing entirely.
 */
function appleScriptDateExpr(varName: string, date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JS months are 0-indexed
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  // Build date from "current date" and override each component
  return `set ${varName} to current date
set year of ${varName} to ${year}
set month of ${varName} to ${month}
set day of ${varName} to ${day}
set hours of ${varName} to ${hours}
set minutes of ${varName} to ${minutes}
set seconds of ${varName} to ${seconds}`;
}

export async function appleCreateEvent(
  title: string,
  startDate: Date,
  endDate: Date,
): Promise<CreateEventResult> {
  const safeTitle = title.replace(/"/g, '\\"');

  const script = `${appleScriptDateExpr("startD", startDate)}
${appleScriptDateExpr("endD", endDate)}
tell application "Calendar"
  tell calendar "${CALENDAR_NAME}"
    set newEvent to make new event at end with properties {summary:"${safeTitle}", start date:startD, end date:endD}
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

  // Get events from ALL calendars — build dates programmatically to avoid locale issues
  const script = `${appleScriptDateExpr("startD", startOfDay)}
${appleScriptDateExpr("endD", endOfDay)}
tell application "Calendar"
  set resultText to ""
  repeat with cal in calendars
    try
      set calEvents to (every event of cal whose start date >= startD and start date <= endD)
      repeat with evt in calEvents
        set resultText to resultText & (summary of evt) & "|||" & (start date of evt as string) & "|||" & (end date of evt as string) & "|||" & (name of cal) & linefeed
      end repeat
    end try
  end repeat
  return resultText
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

  const safeQuery = titleQuery.replace(/"/g, '\\"');

  // First list events to find matches
  const listScript = `${appleScriptDateExpr("startD", startOfDay)}
${appleScriptDateExpr("endD", endOfDay)}
tell application "Calendar"
  set resultText to ""
  tell calendar "${CALENDAR_NAME}"
    set dayEvents to (every event whose start date >= startD and start date <= endD)
    repeat with evt in dayEvents
      set resultText to resultText & (summary of evt) & "|||" & (uid of evt) & "|||" & (start date of evt as string) & linefeed
    end repeat
  end tell
  return resultText
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

  const script = `${appleScriptDateExpr("startD", startOfDay)}
${appleScriptDateExpr("endD", endOfDay)}
tell application "Calendar"
  tell calendar "${CALENDAR_NAME}"
    set dayEvents to (every event whose start date >= startD and start date <= endD)
    set eventCount to count of dayEvents
    if eventCount = 0 then return "אין אירועים ביום הזה."
    set resultText to ""
    repeat with evt in dayEvents
      set resultText to resultText & (summary of evt) & ", "
      delete evt
    end repeat
    return "נמחקו " & eventCount & " אירועים: " & resultText
  end tell
end tell`;

  return runAppleScript(script);
}

export async function appleListCalendars(): Promise<string[]> {
  const output = runAppleScript(`tell application "Calendar"
  set resultText to ""
  repeat with cal in calendars
    set resultText to resultText & (name of cal) & "|||"
  end repeat
  return resultText
end tell`);
  return output.split("|||").map((s) => s.trim()).filter(Boolean);
}
