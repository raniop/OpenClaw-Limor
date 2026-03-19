import { getContacts } from "@/lib/data";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  unknown: "Unknown", client: "Client", lead: "Lead",
  friend: "Friend", family: "Family", work: "Work", service: "Service",
};

const STYLE_LABELS: Record<string, string> = {
  unknown: "—", formal: "Formal", friendly: "Friendly", brief: "Brief", warm: "Warm",
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--text-tertiary)";
  return (
    <div className="score-bar">
      <div className="score-fill" style={{ width: `${score}%`, background: color }} />
    </div>
  );
}

export default function ContactsPage() {
  const contacts = getContacts();

  return (
    <div>
      <h1>Contact Memory</h1>
      <h2>{contacts.length} contacts</h2>

      {contacts.map((c) => (
        <div key={c.chatId} className="card">
          <div className="card-row">
            <div>
              <strong>{c.name}</strong>
              {c.isApproved && <span className="badge badge-approved">Approved</span>}
              {c.relationship && c.relationship.relationshipType !== "unknown" && (
                <span className="badge" style={{ background: "rgba(99,102,241,0.12)", color: "var(--accent)", borderColor: "rgba(99,102,241,0.25)" }}>
                  {TYPE_LABELS[c.relationship.relationshipType]}
                </span>
              )}
            </div>
          </div>

          <div className="card-meta">
            {c.phone} &middot; Last seen: {new Date(c.lastSeen).toLocaleDateString("he-IL")}
            {c.aliases && c.aliases.length > 0 && ` · Aliases: ${c.aliases.join(", ")}`}
          </div>

          {c.relationship && (
            <div className="contact-metrics mt-2">
              <div className="contact-metric">
                <span>Importance: {c.relationship.importanceScore}/100</span>
                <ScoreBar score={c.relationship.importanceScore} />
              </div>
              <div className="contact-metric">Style: {STYLE_LABELS[c.relationship.communicationStyle]}</div>
              <div className="contact-metric">Interactions: {c.relationship.interactionCount}</div>
            </div>
          )}

          {c.facts && c.facts.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted mb-2">Known Facts</div>
              <ul className="facts-list">
                {c.facts.slice(0, 5).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
                {c.facts.length > 5 && <li className="text-muted">+{c.facts.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
