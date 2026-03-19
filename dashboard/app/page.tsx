import { getPendingApprovals, getFollowups, getActivityLog, getCapabilities, getContacts } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardHome() {
  const pending = getPendingApprovals();
  const followups = getFollowups().filter((f) => f.status === "pending");
  const overdue = followups.filter((f) => new Date(f.dueAt) < new Date());
  const activity = getActivityLog(5);
  const capabilities = getCapabilities().filter((c) => c.status === "pending");
  const contacts = getContacts();

  return (
    <div>
      <h1>Dashboard</h1>
      <h2>System overview</h2>

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
          {contacts.slice(0, 5).map((c) => (
            <div key={c.chatId} className="card">
              <div className="card-row">
                <strong>{c.name}</strong>
                {c.relationship && c.relationship.relationshipType !== "unknown" && (
                  <span className="badge badge-approved">{c.relationship.relationshipType}</span>
                )}
              </div>
              <div className="text-xs text-muted mt-1">
                {c.phone} &middot; {new Date(c.lastSeen).toLocaleDateString("he-IL")}
                {c.relationship ? ` · ${c.relationship.importanceScore}/100` : ""}
              </div>
            </div>
          ))}
          <Link href="/contacts" className="text-sm">View all &rarr;</Link>
        </div>
      </div>
    </div>
  );
}
