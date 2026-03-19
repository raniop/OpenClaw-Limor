import { getFollowups } from "@/lib/data";
import { FollowupActions } from "./actions";
import { FollowupTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default function FollowupsPage() {
  const followups = getFollowups();
  const now = new Date();
  const active = followups.filter((f) => f.status === "pending");
  const completed = followups.filter((f) => f.status === "completed");

  return (
    <div>
      <h1>Followups</h1>
      <h2>{active.length} active{completed.length > 0 ? ` · ${completed.length} completed` : ""}</h2>

      <FollowupTabs
        activeContent={
          active.length === 0 ? (
            <div className="card empty-state">No active followups</div>
          ) : (
            active.map((f) => {
              const isOverdue = new Date(f.dueAt) < now;
              return (
                <div key={f.id} className="card">
                  <div className="card-row">
                    <div>
                      <strong>{f.contactName}</strong>
                      <span className={`badge ${isOverdue ? "badge-overdue" : "badge-pending"}`}>
                        {isOverdue ? "Overdue" : "pending"}
                      </span>
                      <div className="pre mt-2" style={{ fontSize: 13, padding: "10px 14px" }}>{f.reason}</div>
                      <div className="card-meta">
                        Due: {new Date(f.dueAt).toLocaleString("he-IL")} · Created: {new Date(f.createdAt).toLocaleString("he-IL")}
                      </div>
                    </div>
                    <FollowupActions id={f.id} />
                  </div>
                </div>
              );
            })
          )
        }
        completedContent={
          completed.length === 0 ? (
            <div className="card empty-state">No completed followups</div>
          ) : (
            completed.map((f) => (
              <div key={f.id} className="card" style={{ opacity: 0.7 }}>
                <div>
                  <strong>{f.contactName}</strong>
                  <span className="badge badge-completed">completed</span>
                  <div className="text-sm mt-2 text-muted">{f.reason}</div>
                  <div className="card-meta">
                    Created: {new Date(f.createdAt).toLocaleString("he-IL")}
                  </div>
                </div>
              </div>
            ))
          )
        }
        activeCount={active.length}
        completedCount={completed.length}
      />
    </div>
  );
}
