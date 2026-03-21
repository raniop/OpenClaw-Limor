import { getPendingApprovals, getFollowups, getActivityLog, getContacts, isLimorRunning, getDigestHistory } from "@/lib/data";
import Link from "next/link";
import { BotControl } from "./components/bot-control";
import { SystemStatus } from "./components/system-status";
import { OpsStatus } from "./components/ops-status";
import { LiveLogs } from "./components/live-logs";
import { StatusFeed } from "./components/status-feed";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  reply: "תגובה",
  tool_use: "כלי",
  approval_request: "בקשת אישור",
  followup_created: "מעקב חדש",
  digest_sent: "דיג׳סט נשלח",
  bot_start: "הפעלה",
  bot_stop: "כיבוי",
  capability_request: "בקשת יכולת",
  group_muted: "קבוצה הושתקה",
};

function ContactIcon({ chatId, isApproved, ownerChatId }: { chatId: string; isApproved: boolean; ownerChatId: string }) {
  if (chatId === ownerChatId) {
    return <span style={{ fontSize: 11, flexShrink: 0 }} title="Owner">👑</span>;
  }
  if (chatId.endsWith("@g.us")) {
    return <span style={{ fontSize: 11, flexShrink: 0 }} title="Group">👥</span>;
  }
  if (isApproved) {
    return <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", flexShrink: 0, display: "inline-block" }} title="Approved" />;
  }
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", flexShrink: 0, display: "inline-block" }} title="Unknown" />;
}

export default function DashboardHome() {
  const pending = getPendingApprovals();
  const followups = getFollowups().filter((f) => f.status === "pending");
  const overdue = followups.filter((f) => new Date(f.dueAt) < new Date());
  const activity = getActivityLog(5);
  const contacts = getContacts();
  const running = isLimorRunning();
  const ownerChatId = process.env.OWNER_CHAT_ID || "";

  // Get latest digest for meetings count
  const digests = getDigestHistory();
  const latestDigest = digests.length > 0 ? digests[0] : null;
  const meetingsToday = latestDigest?.metadata?.meetingsCount ?? 0;

  // Sort contacts by last interaction, take top 5
  const recentContacts = [...contacts]
    .sort((a, b) => {
      const aTime = a.relationship?.lastInteractionAt || a.lastSeen || "";
      const bTime = b.relationship?.lastInteractionAt || b.lastSeen || "";
      return bTime.localeCompare(aTime);
    })
    .slice(0, 5);

  return (
    <div>
      {/* ===== Header ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <h1>לוח בקרה</h1>
          <h2>סקירת מערכת</h2>
        </div>
        <BotControl initialRunning={running} />
      </div>

      {/* ===== Top Row — Status Banner ===== */}
      <SystemStatus />

      {/* ===== Second Row — 4 Stat Cards ===== */}
      <div className="grid grid-4 mt-3">
        <Link href="/approvals" className="stat-card">
          <div className="stat-label">📋 אישורים ממתינים</div>
          <div className="stat-value">{pending.length}</div>
        </Link>

        <Link href="/followups" className="stat-card">
          <div className="stat-label">⏰ מעקבים פתוחים</div>
          <div className="stat-value">
            {followups.length}
            {overdue.length > 0 && (
              <span className="text-danger text-xs" style={{ marginInlineStart: 8 }}>
                ({overdue.length} באיחור)
              </span>
            )}
          </div>
        </Link>

        <div className="stat-card">
          <div className="stat-label">📅 פגישות היום</div>
          <div className="stat-value">{meetingsToday}</div>
        </div>

        <OpsStatus />
      </div>

      {/* ===== Third Row — Recent Activity + Recent Contacts ===== */}
      <div className="grid grid-2 mt-4" style={{ alignItems: "stretch" }}>
        {/* Left column: Recent Activity */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-header">פעילות אחרונה</div>
          <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden" }}>
            {activity.length === 0 ? (
              <div className="empty-state">אין פעילות אחרונה</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>שעה</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>פעולה</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>תוצאה</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 14px", whiteSpace: "nowrap", fontSize: 11, borderBottom: "1px solid rgba(128,128,128,0.06)" }}>
                        {new Date(a.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 12, borderBottom: "1px solid rgba(128,128,128,0.06)" }}>
                        {a.actor} &rarr; {ACTION_LABELS[a.action] || a.action}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 11, borderBottom: "1px solid rgba(128,128,128,0.06)" }}>
                        <span className={a.result.includes("error") ? "text-danger" : a.result === "success" || a.result === "started" ? "text-success" : "text-muted"}>
                          {a.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Link href="/activity" className="text-sm" style={{ marginTop: 4 }}>הצג הכל</Link>
        </div>

        {/* Right column: Recent Contacts */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-header">אנשי קשר אחרונים</div>
          <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden" }}>
            {recentContacts.length === 0 ? (
              <div className="empty-state">אין אנשי קשר</div>
            ) : (
              <div>
                {recentContacts.map((c) => (
                  <div
                    key={c.chatId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 16px",
                      borderBottom: "1px solid rgba(128,128,128,0.06)",
                      fontSize: 13,
                    }}
                  >
                    <ContactIcon chatId={c.chatId} isApproved={c.isApproved} ownerChatId={ownerChatId} />
                    <strong style={{ fontSize: 13 }}>{c.name}</strong>
                    {c.relationship && (
                      <span className="text-xs text-muted" style={{ marginInlineStart: "auto" }}>
                        {c.relationship.interactionCount} הודעות
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link href="/contacts" className="text-sm" style={{ marginTop: 4 }}>הצג הכל</Link>
        </div>
      </div>

      {/* ===== Logs Section ===== */}
      <div className="mt-4">
        <div className="section-header">לוגים אחרונים</div>
        <Link href="/logs" className="card" style={{ display: "block", textDecoration: "none" }}>
          <LiveLogs />
        </Link>
      </div>

      {/* ===== Live Message Feed ===== */}
      <div className="mt-4">
        <StatusFeed />
      </div>

      {/* ===== Bottom Row — Quick Links ===== */}
      <div className="mt-4">
        <div className="section-header">קישורים מהירים</div>
        <div className="grid grid-3">
          <Link href="/ops" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📊</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>תפעול</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>מדדים, התראות, בריאות</div>
          </Link>
          <Link href="/summaries" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>סיכומים</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>סיכומי שיחות יומיים</div>
          </Link>
          <Link href="/followups" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>⏰</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>מעקבים</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>תזכורות ומשימות פתוחות</div>
          </Link>
          <Link href="/contacts" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>👥</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>אנשי קשר</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>רשימת אנשי קשר ומערכות יחסים</div>
          </Link>
          <Link href="/telegram" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>טלגרם</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>ערוצים מנוטרים</div>
          </Link>
          <Link href="/logs" className="card" style={{ textDecoration: "none", textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>לוגים</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>לוג מערכת מלא</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
