import { getPendingApprovals, getFollowups, getActivityLog, getContacts, isLimorRunning, getDigestHistory } from "@/lib/data";
import Link from "next/link";
import { BotControl } from "./components/bot-control";
import { SystemStatus } from "./components/system-status";
import { OpsStatus } from "./components/ops-status";
import { LiveLogs } from "./components/live-logs";
import { StatusFeed } from "./components/status-feed";
// CollapsibleSection available if needed

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  reply: "תגובה",
  tool_use: "כלי",
  tool_call: "כלי",
  approval_request: "בקשת אישור",
  followup_created: "מעקב חדש",
  digest_sent: "דיג׳סט נשלח",
  bot_start: "הפעלה",
  bot_stop: "כיבוי",
  capability_request: "בקשת יכולת",
  group_muted: "קבוצה הושתקה",
};

export default function DashboardHome() {
  const pending = getPendingApprovals();
  const followups = getFollowups().filter((f) => f.status === "pending");
  const overdue = followups.filter((f) => new Date(f.dueAt) < new Date());
  const activity = getActivityLog(5);
  const contacts = getContacts();
  const running = isLimorRunning();
  const ownerChatId = process.env.OWNER_CHAT_ID || "";
  const digests = getDigestHistory();
  const latestDigest = digests.length > 0 ? digests[0] : null;
  const meetingsToday = latestDigest?.metadata?.meetingsCount ?? 0;

  const recentContacts = [...contacts]
    .sort((a, b) => {
      // Owner always first
      if (a.chatId === ownerChatId) return -1;
      if (b.chatId === ownerChatId) return 1;
      const aTime = a.relationship?.lastInteractionAt || a.lastSeen || "";
      const bTime = b.relationship?.lastInteractionAt || b.lastSeen || "";
      return bTime.localeCompare(aTime);
    });

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

      {/* ===== Status Banner ===== */}
      <SystemStatus />

      {/* ===== Stat Cards Row ===== */}
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

      {/* ===== Contacts — Horizontal Strip ===== */}
      <div className="mt-3">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="section-header" style={{ margin: 0 }}>👥 אנשי קשר ({contacts.length})</div>
          <Link href="/contacts" className="text-sm">הצג הכל →</Link>
        </div>
        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          paddingBottom: 6,
        }}>
          {recentContacts.map((c) => {
            const initials = c.name.split(/\s+/).map((w: string) => w[0]).join("").substring(0, 2).toUpperCase();
            const isOwner = c.chatId === ownerChatId;
            const msgCount = c.relationship?.interactionCount || 0;
            const hue = c.name.split("").reduce((acc: number, ch: string) => acc + ch.charCodeAt(0), 0) % 360;

            return (
              <div
                key={c.chatId}
                className="card"
                style={{
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 110,
                  maxWidth: 130,
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: isOwner ? "linear-gradient(135deg, #f59e0b, #f97316)" : `hsl(${hue}, 45%, 35%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  border: c.isApproved ? "2px solid var(--success)" : "2px solid transparent",
                }}>
                  {isOwner ? "👑" : initials}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-primary)",
                  maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", textAlign: "center",
                }}>
                  {c.name}
                </div>
                {c.phone && (
                  <div style={{ fontSize: 10, color: "var(--accent)", direction: "ltr", fontWeight: 500 }}>
                    {c.phone.replace(/^972(\d)/, "0$1").replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3")}
                  </div>
                )}
                {msgCount > 0 && (
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{msgCount} 💬</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Three Columns: Activity | Logs | Feed ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>

        {/* Column 1: Activity */}
        <div className="card" style={{ padding: 0, minWidth: 0, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", borderBottom: "1px solid var(--glass-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>⚡ פעילות</span>
            <Link href="/activity" style={{ fontSize: 10, color: "var(--accent)" }}>הכל →</Link>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 10px" }}>
            {activity.length === 0 ? (
              <div className="text-muted text-sm" style={{ padding: 12, textAlign: "center" }}>אין פעילות</div>
            ) : activity.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 0", borderBottom: "1px solid rgba(128,128,128,0.05)",
                fontSize: 11,
              }}>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>
                  {new Date(a.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.actor.split(" ")[0]} → {ACTION_LABELS[a.action] || a.action}
                </span>
                <span style={{
                  fontSize: 9, flexShrink: 0, padding: "1px 5px", borderRadius: 3,
                  color: a.result.includes("error") ? "var(--danger)" : "var(--success)",
                  background: a.result.includes("error") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                }}>
                  {a.result}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Logs */}
        <div className="card" style={{ padding: 0, minWidth: 0, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", borderBottom: "1px solid var(--glass-border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>📋 לוגים</span>
            <Link href="/logs" style={{ fontSize: 10, color: "var(--accent)" }}>הכל →</Link>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 6px" }}>
            <LiveLogs />
          </div>
        </div>

        {/* Column 3: Feed */}
        <div className="card" style={{ padding: 0, minWidth: 0, overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", borderBottom: "1px solid var(--glass-border)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>💬 פיד הודעות</span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px 6px" }}>
            <StatusFeed />
          </div>
        </div>

      </div>
    </div>
  );
}
