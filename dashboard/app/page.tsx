import { getPendingApprovals, getFollowups, getActivityLog, getCapabilities, getContacts, isLimorRunning } from "@/lib/data";
import Link from "next/link";
import { BotControl } from "./components/bot-control";
import { LiveLogs } from "./components/live-logs";
import { SystemStatus } from "./components/system-status";

export const dynamic = "force-dynamic";

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
  const capabilities = getCapabilities().filter((c) => c.status === "pending");
  const contacts = getContacts();
  const running = isLimorRunning();
  const ownerChatId = process.env.OWNER_CHAT_ID || "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <h1>Dashboard</h1>
          <h2>System overview</h2>
        </div>
        <BotControl initialRunning={running} />
      </div>

      <SystemStatus />

      <div className="grid grid-3 mt-3">
        <Link href="/approvals" className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value">{pending.length}</div>
        </Link>
        <Link href="/followups" className="stat-card">
          <div className="stat-label">Active Followups</div>
          <div className="stat-value">
            {followups.length}
            {overdue.length > 0 && <span className="text-danger text-xs" style={{ marginInlineStart: 8 }}>({overdue.length} overdue)</span>}
          </div>
        </Link>
        <Link href="/capabilities" className="stat-card">
          <div className="stat-label">Pending Capabilities</div>
          <div className="stat-value">{capabilities.length}</div>
        </Link>
      </div>

      <div className="grid grid-2 mt-4" style={{ alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-header">Recent Activity</div>
          <div className="card" style={{ flex: 1, padding: 0, overflow: "hidden" }}>
            {activity.length === 0 ? (
              <div className="empty-state">No recent activity</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Time</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Action</th>
                    <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "start", borderBottom: "1px solid var(--glass-border)" }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 14px", whiteSpace: "nowrap", fontSize: 11, borderBottom: "1px solid rgba(128,128,128,0.06)" }}>{new Date(a.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ padding: "8px 14px", fontSize: 12, borderBottom: "1px solid rgba(128,128,128,0.06)" }}>{a.actor} &rarr; {a.action}</td>
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
          <Link href="/activity" className="text-sm">View all &rarr;</Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-header">Contacts ({contacts.length})</div>
          <div className="card" style={{ flex: 1, padding: "8px 16px", overflow: "hidden", display: "flex", alignItems: "center" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", width: "100%" }}>
              {contacts.map((c) => (
                <div key={c.chatId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 13 }}>
                  <ContactIcon chatId={c.chatId} isApproved={c.isApproved} ownerChatId={ownerChatId} />
                  <strong style={{ fontSize: 13 }}>{c.name}</strong>
                  <span className="text-xs text-muted" style={{ marginInlineStart: "auto" }}>{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
          <Link href="/contacts" className="text-sm">View all &rarr;</Link>
        </div>
      </div>

      {/* Recent Logs — live updating */}
      <div className="mt-4">
        <div className="section-header">Recent Logs</div>
        <Link href="/logs" className="card" style={{ display: "block", textDecoration: "none" }}>
          <LiveLogs />
        </Link>
      </div>
    </div>
  );
}
