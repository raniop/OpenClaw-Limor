import { getPendingApprovals, getFollowups, getActivityLog, getCapabilities, getContacts, getLogs, isLimorRunning } from "@/lib/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardHome() {
  const pending = getPendingApprovals();
  const followups = getFollowups().filter((f) => f.status === "pending");
  const overdue = followups.filter((f) => new Date(f.dueAt) < new Date());
  const activity = getActivityLog(5);
  const capabilities = getCapabilities().filter((c) => c.status === "pending");
  const contacts = getContacts();
  const running = isLimorRunning();
  const recentLogs = getLogs(5);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1>Dashboard</h1>
        <div className="card" style={{ padding: "10px 18px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: running ? "var(--success)" : "var(--danger)",
            boxShadow: running
              ? "0 0 10px var(--success-glow), 0 0 20px var(--success-glow)"
              : "0 0 10px var(--danger-glow)",
            animation: running ? "pulseGlow 2s ease-in-out infinite" : "none",
            display: "inline-block",
          }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: running ? "var(--success)" : "var(--danger)" }}>
            {running ? "Limor Online" : "Limor Offline"}
          </span>
        </div>
      </div>
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

      {/* Recent Logs */}
      <div className="mt-4">
        <div className="section-header">Recent Logs</div>
        <Link href="/logs" className="card" style={{ display: "block", textDecoration: "none" }}>
          {recentLogs.length === 0 ? (
            <div className="text-muted text-sm" style={{ textAlign: "center", padding: "12px 0" }}>
              No logs yet — start Limor to see activity
            </div>
          ) : (
            <div style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.8 }}>
              {recentLogs.slice(0, 5).map((line, i) => (
                <div key={i} style={{ color: "var(--text-secondary)" }}>
                  {line.timestamp && (
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {new Date(line.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  )}{" "}
                  <span style={{ color: line.level === "ERROR" ? "var(--danger)" : line.level === "WARN" ? "var(--warning)" : "var(--text-primary)", fontWeight: line.level === "ERROR" ? 700 : 400 }}>
                    {line.level}
                  </span>{" "}
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>[{line.domain}]</span>{" "}
                  <span style={{ color: "var(--text-primary)" }}>{line.message?.substring(0, 80)}</span>
                </div>
              ))}
              <div className="text-xs text-muted mt-2">View all logs &rarr;</div>
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
