"use client";

import { useState, useEffect } from "react";

interface Reminder {
  task: string;
  requesterName: string;
  dueAt: Date;
  isOverdue: boolean;
}

function formatCountdown(ms: number): { num: string; unit: string } {
  const abs = Math.abs(ms);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 1) return { num: String(day), unit: day === 1 ? "יום" : "ימים" };
  if (hr >= 1) return { num: String(hr), unit: hr === 1 ? "שעה" : "שעות" };
  if (min >= 1) return { num: String(min), unit: min === 1 ? "דקה" : "דקות" };
  return { num: String(sec), unit: "שניות" };
}

export function CountdownHero({ reminder }: { reminder: Reminder }) {
  const dueMs = new Date(reminder.dueAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = dueMs - now;
  const isOverdue = ms < 0;
  const { num, unit } = formatCountdown(ms);

  return (
    <div className={`reminders-hero ${isOverdue ? "reminders-hero-overdue" : ""}`}>
      <div className="reminders-hero-label">
        {isOverdue ? "🔥 התזכורת באיחור" : "⏳ התזכורת הקרובה"}
      </div>
      <div className="reminders-hero-task">{reminder.task || "ללא תיאור"}</div>
      <div className="reminders-hero-countdown">
        <span className="reminders-hero-prefix">{isOverdue ? "באיחור של" : "בעוד"}</span>
        <span className="reminders-hero-number">{num}</span>
        <span className="reminders-hero-unit">{unit}</span>
      </div>
      <div className="reminders-hero-time">
        🕐{" "}
        {new Date(reminder.dueAt).toLocaleString("he-IL", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jerusalem",
        })}
      </div>
    </div>
  );
}
