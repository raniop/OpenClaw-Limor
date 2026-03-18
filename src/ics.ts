/**
 * Generate ICS (iCalendar) content for a calendar invite
 */
export function generateICS(opts: {
  title: string;
  startDate: Date;
  durationMinutes: number;
  description?: string;
  organizer?: string;
}): string {
  const { title, startDate, durationMinutes, description, organizer } = opts;
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@limor`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Limor AI//WhatsApp Bot//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${fmt(startDate)}`,
    `DTEND:${fmt(endDate)}`,
    `SUMMARY:${title}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${description.replace(/\n/g, "\\n")}`);
  }
  if (organizer) {
    lines.push(`ORGANIZER:${organizer}`);
  }

  lines.push(
    `DTSTAMP:${fmt(new Date())}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.join("\r\n");
}
