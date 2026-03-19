import { getPendingApprovals, getFollowups, getActivityLog, getCapabilities, getContacts, isLimorRunning } from "@/lib/data";
import Link from "next/link";
import { BotControl } from "./components/bot-control";
import { LiveLogs } from "./components/live-logs";

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

      <div className="grid grid-3">
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

      <div className="grid grid-2 mt-4">
        <div>
          <div className="section-header">Recent Activity</div>
          {activity.length === 0 ? (
            <div className="card empty-state">No recent activity</div>
          ) : (
            activity.map((a, i) => (
              <div key={i} className="card">
                <div className="text-sm">
                  <span className="text-muted">{new Date(a.timestamp).toLocaleString("he-IL")}</span>
                </div>
                <div className="text-sm mt-1">
                  <strong>{a.actor}</strong> &rarr; {a.action}: {a.target}
                </div>
                <div className="text-xs text-muted mt-1">{a.result}</div>
              </div>
            ))
          )}
          <Link href="/activity" className="text-sm">View all &rarr;</Link>
        </div>

        <div>
          <div className="section-header">Contacts ({contacts.length})</div>
          <div className="card" style={{ padding: "8px 16px", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
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
