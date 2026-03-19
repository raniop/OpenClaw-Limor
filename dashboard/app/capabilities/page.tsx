import { getCapabilities } from "@/lib/data";
import { CapabilityActions } from "./actions";

export const dynamic = "force-dynamic";

export default function CapabilitiesPage() {
  const capabilities = getCapabilities();

  return (
    <div>
      <h1>Capability Requests</h1>
      <h2>{capabilities.length} total</h2>

      {capabilities.length === 0 ? (
        <div className="card empty-state">No capability requests</div>
      ) : (
        capabilities.map((c) => (
          <div key={c.id} className="card">
            <div className="card-row-top">
              <div>
                <strong>{c.title}</strong>
                <span className={`badge badge-${c.status}`}>{c.status}</span>
                <span className="text-xs text-muted" style={{ marginInlineStart: 8 }}>{c.level}</span>
                <div className="card-meta">
                  {c.id} &middot; {c.requestedBy} &middot; {new Date(c.createdAt).toLocaleDateString("he-IL")}
                </div>
                {c.problem && <div className="card-detail mt-2"><strong>Problem:</strong> {c.problem.substring(0, 200)}</div>}
                {c.proposedSolution && <div className="card-detail mt-1"><strong>Solution:</strong> {c.proposedSolution.substring(0, 200)}</div>}
              </div>
              {c.status === "pending" && <CapabilityActions id={c.id} />}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
