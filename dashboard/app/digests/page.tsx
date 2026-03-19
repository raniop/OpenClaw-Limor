import { getDigestHistory } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function DigestsPage() {
  const digests = getDigestHistory();

  return (
    <div>
      <h1>Digest History</h1>
      <h2>{digests.length} digests recorded</h2>

      {digests.length === 0 ? (
        <div className="card empty-state">
          No digests generated yet. Send &quot;תקציר&quot; to Limor or wait for the daily 08:00 digest.
        </div>
      ) : (
        digests.map((d) => (
          <div key={d.id} className="card">
            <div className="card-row mb-2">
              <strong>{new Date(d.timestamp).toLocaleString("he-IL")}</strong>
              {d.metadata && (
                <div className="digest-stats">
                  <span className="digest-stat">Urgent: {d.metadata.urgentCount}</span>
                  <span className="digest-stat">Waiting: {d.metadata.waitingCount}</span>
                  <span className="digest-stat">Meetings: {d.metadata.meetingsCount}</span>
                  <span className="digest-stat">Followups: {d.metadata.followupsCount}</span>
                </div>
              )}
            </div>
            <div className="pre">{d.text}</div>
          </div>
        ))
      )}
    </div>
  );
}
