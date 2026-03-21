"use client";

import { useEffect, useState } from "react";

interface DailySummary {
  chatId: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  urgent: string[];
  open: string[];
  done: string[];
  failed: string[];
}

interface SummaryResponse {
  summaries: DailySummary[];
  date: string | null;
  availableDates: string[];
}

export default function SummariesPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummaries();
  }, []);

  async function fetchSummaries(date?: string) {
    setLoading(true);
    try {
      const url = date
        ? `/api/daily-summaries?date=${date}`
        : "/api/daily-summaries";
      const res = await fetch(url);
      const json: SummaryResponse = await res.json();
      setData(json);
      if (json.date && !selectedDate) {
        setSelectedDate(json.date);
      }
    } catch (err) {
      console.error("Failed to fetch summaries:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    fetchSummaries(date);
  }

  // Merge all items across summaries
  const allUrgent: { item: string; contact: string }[] = [];
  const allOpen: { item: string; contact: string }[] = [];
  const allDone: { item: string; contact: string }[] = [];
  const allFailed: { item: string; contact: string }[] = [];

  if (data?.summaries) {
    for (const s of data.summaries) {
      for (const item of s.urgent) allUrgent.push({ item, contact: s.contactName });
      for (const item of s.open) allOpen.push({ item, contact: s.contactName });
      for (const item of s.done) allDone.push({ item, contact: s.contactName });
      for (const item of s.failed) allFailed.push({ item, contact: s.contactName });
    }
  }

  const totalItems = allUrgent.length + allOpen.length + allDone.length + allFailed.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1>בריפינג יומי</h1>
          <h2>סיכום מנהלים — מה קרה, מה פתוח, מה דחוף</h2>
        </div>

        {data && data.availableDates.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>תאריך:</label>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
                background: "var(--glass-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {data.availableDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card empty-state">טוען...</div>
      ) : !data || totalItems === 0 ? (
        <div className="card empty-state">
          אין בריפינג זמין{selectedDate ? ` עבור ${selectedDate}` : ""}.
          בריפינגים נוצרים בשעה 14:00 ו-23:00.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-3 mt-3">
            <div className="stat-card" style={{ borderRight: allUrgent.length > 0 ? "3px solid #ef4444" : undefined }}>
              <div className="stat-label">דחוף</div>
              <div className="stat-value" style={{ color: allUrgent.length > 0 ? "#ef4444" : undefined }}>
                {allUrgent.length}
              </div>
            </div>
            <div className="stat-card" style={{ borderRight: allOpen.length > 0 ? "3px solid #f59e0b" : undefined }}>
              <div className="stat-label">פתוח</div>
              <div className="stat-value" style={{ color: allOpen.length > 0 ? "#f59e0b" : undefined }}>
                {allOpen.length}
              </div>
            </div>
            <div className="stat-card" style={{ borderRight: allDone.length > 0 ? "3px solid #22c55e" : undefined }}>
              <div className="stat-label">טופל</div>
              <div className="stat-value" style={{ color: allDone.length > 0 ? "#22c55e" : undefined }}>
                {allDone.length}
              </div>
            </div>
          </div>

          {/* Urgent section */}
          {allUrgent.length > 0 && (
            <BriefingSection
              icon="🔴"
              title="דחוף — צריך תשומת לב"
              items={allUrgent}
              borderColor="#ef4444"
              bgColor="rgba(239, 68, 68, 0.06)"
            />
          )}

          {/* Open section */}
          {allOpen.length > 0 && (
            <BriefingSection
              icon="🟡"
              title="פתוח — לא סגור"
              items={allOpen}
              borderColor="#f59e0b"
              bgColor="rgba(245, 158, 11, 0.06)"
            />
          )}

          {/* Done section */}
          {allDone.length > 0 && (
            <BriefingSection
              icon="✅"
              title="טופל היום"
              items={allDone}
              borderColor="#22c55e"
              bgColor="rgba(34, 197, 94, 0.06)"
            />
          )}

          {/* Failed section */}
          {allFailed.length > 0 && (
            <BriefingSection
              icon="⚠️"
              title="כשלים"
              items={allFailed}
              borderColor="#8b5cf6"
              bgColor="rgba(139, 92, 246, 0.06)"
            />
          )}

          {/* Per-contact breakdown */}
          <div className="mt-4">
            <div className="section-header">פירוט לפי איש קשר ({data.summaries.length})</div>
            {data.summaries.map((s) => (
              <ContactBreakdown key={s.chatId} summary={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BriefingSection({
  icon,
  title,
  items,
  borderColor,
  bgColor,
}: {
  icon: string;
  title: string;
  items: { item: string; contact: string }[];
  borderColor: string;
  bgColor: string;
}) {
  return (
    <div
      className="card mt-3"
      style={{
        borderRight: `3px solid ${borderColor}`,
        background: bgColor,
        direction: "rtl",
        textAlign: "right",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>{title}</strong>
      </div>
      {items.map((entry, i) => (
        <div
          key={i}
          style={{
            fontSize: 13,
            lineHeight: 1.8,
            color: "var(--text-secondary)",
            paddingRight: 4,
          }}
        >
          &bull; {entry.item}
        </div>
      ))}
    </div>
  );
}

function ContactBreakdown({ summary }: { summary: DailySummary }) {
  const hasUrgent = summary.urgent.length > 0;
  const hasOpen = summary.open.length > 0;
  const hasDone = summary.done.length > 0;
  const hasFailed = summary.failed.length > 0;

  return (
    <div className="card" style={{ marginBottom: 12, direction: "rtl", textAlign: "right" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{summary.isGroup ? "👥" : "👤"}</span>
          <strong style={{ fontSize: 14 }}>{summary.contactName}</strong>
          {hasUrgent && (
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              fontWeight: 500,
            }}>
              דחוף
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {summary.messageCount} הודעות
        </span>
      </div>

      {hasUrgent && (
        <ItemList items={summary.urgent} color="#ef4444" />
      )}
      {hasOpen && (
        <ItemList items={summary.open} color="#f59e0b" />
      )}
      {hasDone && (
        <ItemList items={summary.done} color="#22c55e" />
      )}
      {hasFailed && (
        <ItemList items={summary.failed} color="#8b5cf6" />
      )}
    </div>
  );
}

function ItemList({ items, color }: { items: string[]; color: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            paddingRight: 8,
            borderRight: `2px solid ${color}`,
            marginBottom: 2,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
