import { getPendingApprovals } from "@/lib/data";
import { ApprovalActions } from "./actions";

export const dynamic = "force-dynamic";

export default function ApprovalsPage() {
  const pending = getPendingApprovals();

  return (
    <div>
      <h1>Pending Approvals</h1>
      <h2>{pending.length} contacts waiting</h2>

      {pending.length === 0 ? (
        <div className="card empty-state">No pending approvals</div>
      ) : (
        pending.map((p) => (
          <div key={p.code} className="card">
            <div className="card-row">
              <div>
                <strong>{p.phone}</strong>
                <span className="badge badge-pending">{p.code}</span>
                <div className="card-meta">
                  {p.chatId} &middot; Since {new Date(p.createdAt).toLocaleDateString("he-IL")}
                </div>
              </div>
              <ApprovalActions code={p.code} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
