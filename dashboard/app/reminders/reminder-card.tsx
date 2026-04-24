"use client";

import { useState, useEffect } from "react";

interface Props {
  id: string;
  task: string;
  requesterName: string;
  dueAt: string;
  createdAt: string;
  status: "pending" | "completed";
  isOverdue: boolean;
  msUntilDue: number;
}

function formatRelative(ms: number): string {
  const abs = Math.abs(ms);
  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 2) return `${day} ימים`;
  if (day === 1) return "מחר";
  if (hr >= 1) return `${hr} שעות${min % 60 > 0 ? ` ו-${min % 60} דקות` : ""}`;
  if (min >= 1) return `${min} דקות`;
  return `${sec} שניות`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

export function ReminderCard({
  id,
  task,
  requesterName,
  dueAt,
  createdAt,
  status,
  isOverdue,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(status === "completed");

  // Live tick — refresh "in X minutes" every 15s
  useEffect(() => {
    if (completed) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [completed]);

  const dueMs = new Date(dueAt).getTime();
  const ms = dueMs - now;
  const overdueNow = !completed && ms < 0;
  const relText = completed
    ? "הושלמה"
    : overdueNow
      ? `איחור של ${formatRelative(ms)}`
      : `בעוד ${formatRelative(ms)}`;

  async function handleComplete() {
    if (completing || completed) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "complete" }),
      });
      if (res.ok) {
        setCompleted(true);
      } else {
        setCompleting(false);
      }
    } catch {
      setCompleting(false);
    }
  }

  const cardClass = [
    "reminder-card",
    completed && "reminder-card-completed",
    !completed && overdueNow && "reminder-card-overdue",
    !completed && !overdueNow && ms <= 30 * 60 * 1000 && "reminder-card-soon",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClass}>
      <div className="reminder-card-body">
        <div className="reminder-card-task">{task || "ללא תיאור"}</div>
        <div className="reminder-card-meta">
          <span className="reminder-meta-chip reminder-meta-time" title={formatDateTime(dueAt)}>
            ⏰ {formatDateTime(dueAt)}
          </span>
          <span
            className={`reminder-meta-chip ${overdueNow ? "reminder-meta-overdue" : "reminder-meta-relative"}`}
          >
            {overdueNow ? "🔥" : "⏳"} {relText}
          </span>
          {requesterName && (
            <span className="reminder-meta-chip reminder-meta-from">👤 {requesterName}</span>
          )}
        </div>
        <div className="reminder-card-created">נוצרה: {formatDateTime(createdAt)}</div>
      </div>
      {!completed && (
        <button
          className="reminder-card-complete"
          onClick={handleComplete}
          disabled={completing}
          title="סמן כהושלם"
        >
          {completing ? "..." : "✓ סיימתי"}
        </button>
      )}
      {completed && <div className="reminder-card-done-badge">✅ הושלם</div>}
    </div>
  );
}
