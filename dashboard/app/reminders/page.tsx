import { getFollowups } from "@/lib/data";
import { ReminderCard } from "./reminder-card";
import { CountdownHero } from "./countdown-hero";

export const dynamic = "force-dynamic";

interface NormalizedReminder {
  id: string;
  task: string;
  requesterName: string;
  dueAt: Date;
  createdAt: Date;
  status: "pending" | "completed";
  isOverdue: boolean;
  msUntilDue: number;
}

function stripPrefix(reason: string): string {
  return reason.replace(/^\[מ-[^\]]+\]\s*/, "");
}

export default function RemindersPage() {
  const followups = getFollowups();
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const normalized: NormalizedReminder[] = followups.map((f) => {
    const due = new Date(f.dueAt);
    return {
      id: f.id,
      task: stripPrefix(f.reason),
      requesterName: f.requesterName || f.contactName,
      dueAt: due,
      createdAt: new Date(f.createdAt),
      status: f.status,
      isOverdue: f.status === "pending" && due < now,
      msUntilDue: due.getTime() - now.getTime(),
    };
  });

  const pending = normalized
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const completed = normalized
    .filter((r) => r.status === "completed")
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());

  const overdue = pending.filter((r) => r.isOverdue);
  const next30min = pending.filter((r) => !r.isOverdue && r.msUntilDue <= 30 * 60 * 1000);
  const today = pending.filter(
    (r) => !r.isOverdue && r.msUntilDue > 30 * 60 * 1000 && r.dueAt <= todayEnd
  );
  const thisWeek = pending.filter((r) => r.dueAt > todayEnd && r.dueAt <= weekEnd);
  const later = pending.filter((r) => r.dueAt > weekEnd);

  const next = pending.find((r) => !r.isOverdue) || pending[0];

  return (
    <div className="reminders-page" dir="rtl">
      <header className="reminders-header">
        <div>
          <h1 className="reminders-title">🔔 תזכורות</h1>
          <p className="reminders-subtitle">
            כל מה שלימור שומרת בשבילך — לפי דחיפות
          </p>
        </div>
        <div className="reminders-stats">
          <span className="stat-pill stat-pending">
            <strong>{pending.length}</strong> פעילות
          </span>
          {overdue.length > 0 && (
            <span className="stat-pill stat-overdue">
              <strong>{overdue.length}</strong> באיחור
            </span>
          )}
          {completed.length > 0 && (
            <span className="stat-pill stat-completed">
              <strong>{completed.length}</strong> הושלמו
            </span>
          )}
        </div>
      </header>

      {next && next.status === "pending" && <CountdownHero reminder={next} />}

      <ReminderSection
        title="🔥 דחוף — באיחור"
        reminders={overdue}
        emptyMessage={null}
        accent="danger"
      />
      <ReminderSection
        title="⚡ ב-30 הדקות הקרובות"
        reminders={next30min}
        emptyMessage={null}
        accent="warning"
      />
      <ReminderSection
        title="📅 היום"
        reminders={today}
        emptyMessage={null}
        accent="info"
      />
      <ReminderSection
        title="🗓️ השבוע הקרוב"
        reminders={thisWeek}
        emptyMessage={null}
        accent="muted"
      />
      <ReminderSection
        title="📦 בעתיד יותר רחוק"
        reminders={later}
        emptyMessage={null}
        accent="muted"
      />

      {pending.length === 0 && (
        <div className="reminders-empty">
          <div className="reminders-empty-icon">🌿</div>
          <h3>אין תזכורות פעילות</h3>
          <p>שלח/י ללימור הודעה כמו "תזכירי לי בעוד שעה לבדוק את הדואר".</p>
        </div>
      )}

      {completed.length > 0 && (
        <ReminderSection
          title="✅ ארכיון — תזכורות שהושלמו"
          reminders={completed.slice(0, 20)}
          emptyMessage={null}
          accent="muted"
          dimmed
        />
      )}
    </div>
  );
}

function ReminderSection({
  title,
  reminders,
  emptyMessage,
  accent,
  dimmed = false,
}: {
  title: string;
  reminders: NormalizedReminder[];
  emptyMessage: string | null;
  accent: "danger" | "warning" | "info" | "muted";
  dimmed?: boolean;
}) {
  if (reminders.length === 0 && !emptyMessage) return null;

  return (
    <section className={`reminders-section reminders-section-${accent}`} style={dimmed ? { opacity: 0.6 } : undefined}>
      <h2 className="reminders-section-title">
        {title} <span className="reminders-section-count">{reminders.length}</span>
      </h2>
      <div className="reminders-grid">
        {reminders.length === 0 ? (
          <div className="reminders-section-empty">{emptyMessage}</div>
        ) : (
          reminders.map((r) => (
            <ReminderCard
              key={r.id}
              id={r.id}
              task={r.task}
              requesterName={r.requesterName}
              dueAt={r.dueAt.toISOString()}
              createdAt={r.createdAt.toISOString()}
              status={r.status}
              isOverdue={r.isOverdue}
              msUntilDue={r.msUntilDue}
            />
          ))
        )}
      </div>
    </section>
  );
}
