"use client";

import { useEffect, useState } from "react";

interface ChatSummary {
  chatId: string;
  contactName: string;
  isGroup: boolean;
  messageCount: number;
  summary: string;
  topics: string[];
  openItems: string[];
  mood: string;
}

interface SummaryResponse {
  summaries: ChatSummary[];
  date: string | null;
  availableDates: string[];
}

const MOOD_LABELS: Record<string, string> = {
  friendly: "ידידותי",
  business: "עסקי",
  urgent: "דחוף",
  casual: "חופשי",
  tense: "מתוח",
};

const MOOD_COLORS: Record<string, string> = {
  friendly: "#22c55e",
  business: "#3b82f6",
  urgent: "#ef4444",
  casual: "#a78bfa",
  tense: "#f59e0b",
};

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

  const contacts = data?.summaries.filter((s) => !s.isGroup) || [];
  const groups = data?.summaries.filter((s) => s.isGroup) || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1>Conversation Summaries</h1>
          <h2>Daily AI-generated conversation summaries</h2>
        </div>

        {data && data.availableDates.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Date:</label>
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
        <div className="card empty-state">Loading...</div>
      ) : !data || data.summaries.length === 0 ? (
        <div className="card empty-state">
          No summaries available{selectedDate ? ` for ${selectedDate}` : ""}.
          Summaries are generated daily at 23:00 Israel time.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-3 mt-3">
            <div className="stat-card">
              <div className="stat-label">Total Conversations</div>
              <div className="stat-value">{data.summaries.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Contacts</div>
              <div className="stat-value">{contacts.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Groups</div>
              <div className="stat-value">{groups.length}</div>
            </div>
          </div>

          {/* Contacts section */}
          {contacts.length > 0 && (
            <div className="mt-4">
              <div className="section-header">Contacts ({contacts.length})</div>
              {contacts.map((s) => (
                <SummaryCard key={s.chatId} summary={s} />
              ))}
            </div>
          )}

          {/* Groups section */}
          {groups.length > 0 && (
            <div className="mt-4">
              <div className="section-header">Groups ({groups.length})</div>
              {groups.map((s) => (
                <SummaryCard key={s.chatId} summary={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: ChatSummary }) {
  const moodColor = MOOD_COLORS[summary.mood] || "#a78bfa";
  const moodLabel = MOOD_LABELS[summary.mood] || summary.mood;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{summary.isGroup ? "👥" : "👤"}</span>
          <strong style={{ fontSize: 14 }}>{summary.contactName}</strong>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: `${moodColor}20`,
              color: moodColor,
              fontWeight: 500,
            }}
          >
            {moodLabel}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {summary.messageCount} messages
        </span>
      </div>

      {/* Summary text */}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text-secondary)",
          whiteSpace: "pre-wrap",
          marginBottom: 10,
          direction: "rtl",
          textAlign: "right",
        }}
      >
        {summary.summary}
      </div>

      {/* Topics */}
      {summary.topics.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {summary.topics.map((topic, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(59, 130, 246, 0.1)",
                color: "var(--text-secondary)",
              }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Open items */}
      {summary.openItems.length > 0 && (
        <div
          style={{
            fontSize: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.12)",
            direction: "rtl",
            textAlign: "right",
          }}
        >
          <strong style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>
            Open Items:
          </strong>
          {summary.openItems.map((item, i) => (
            <div key={i} style={{ color: "var(--text-secondary)", marginBottom: 2 }}>
              &bull; {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
