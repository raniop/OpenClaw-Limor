import nodemailer from "nodemailer";
import { config } from "./config";
import { generateICS } from "./ics";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.smtpEmail,
        pass: config.smtpPassword,
      },
    });
  }
  return transporter;
}

export async function sendCalendarInviteEmail(opts: {
  to: string;
  title: string;
  startDate: Date;
  durationMinutes: number;
  description?: string;
}): Promise<void> {
  const { to, title, startDate, durationMinutes, description } = opts;

  const icsContent = generateICS({
    title,
    startDate,
    durationMinutes,
    description,
    organizer: config.smtpEmail,
  });

  const timeStr = startDate.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = startDate.toLocaleDateString("he-IL");

  const mail = getTransporter();
  await mail.sendMail({
    from: `"${config.botName} - עוזרת אישית" <${config.smtpEmail}>`,
    to,
    subject: `📅 הזמנה: ${title} - ${dateStr} ${timeStr}`,
    text: `הוזמנת לפגישה!\n\n${title}\nתאריך: ${dateStr}\nשעה: ${timeStr}\nמשך: ${durationMinutes} דקות\n${description ? `\n${description}` : ""}\n\nנשלח על ידי ${config.botName} 🐾`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>📅 הזמנה לפגישה</h2>
        <p><strong>${title}</strong></p>
        <p>📆 תאריך: ${dateStr}</p>
        <p>🕐 שעה: ${timeStr}</p>
        <p>⏱️ משך: ${durationMinutes} דקות</p>
        ${description ? `<p>📝 ${description}</p>` : ""}
        <hr/>
        <p style="color: #888; font-size: 12px;">נשלח על ידי ${config.botName} 🐾 - עוזרת אישית חכמה</p>
      </div>
    `,
    icalEvent: {
      method: "REQUEST",
      content: icsContent,
    },
  });
}
