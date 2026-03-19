import { getFollowups } from "@/lib/data";
import { FollowupActions } from "./actions";

export const dynamic = "force-dynamic";

export default function FollowupsPage() {
  const followups = getFollowups();
  const now = new Date();

  return (
    <div>
      <h1>Followups</h1>
      <h2>{followups.filter((f) => f.status === "pending").length} active</h2>

      {followups.length === 0 ? (
        <div className="card empty-state">No followups</div>
      ) : (
        followups.map((f) => {
          const isOverdue = f.status === "pending" && new Date(f.dueAt) < now;
          return (
            <div key={f.id} className="card">
              <div className="card-row">
                <div>
                  <strong>{f.contactName}</strong>
                  <span className={`badge ${isOverdue ? "badge-overdue" : f.status === "completed" ? "badge-completed" : "badge-pending"}`}>
                    {isOverdue ? "Overdue" : f.status}
                  </span>
                  <div className="text-sm mt-2">{f.reason}</div>
                  <div className="card-meta">
                    Due: {new Date(f.dueAt).toLocaleString("he-IL")} &middot; Created: {new Date(f.createdAt).toLocaleString("he-IL")}
                  </div>
                </div>
                {f.status === "pending" && <FollowupActions id={f.id} />}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
