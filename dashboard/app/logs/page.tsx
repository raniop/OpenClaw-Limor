import { getLogs, isLimorRunning } from "@/lib/data";

export const dynamic = "force-dynamic";

const LEVEL_COLORS: Record<string, string> = {
  INFO: "var(--text-primary)",
  WARN: "var(--warning)",
  ERROR: "var(--danger)",
  DEBUG: "var(--text-tertiary)",
};

const DOMAIN_COLORS: Record<string, string> = {
  system: "var(--accent)",
  trace: "var(--success)",
  msg: "#8b5cf6",
  tool: "#06b6d4",
  api: "#f59e0b",
  approval: "#ec4899",
  media: "#14b8a6",
  memory: "#a78bfa",
};

export default function LogsPage() {
  const running = isLimorRunning();
  const logs = getLogs(300);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Logs</h1>
          <h2>{logs.length} entries</h2>
        </div>
        <div className="card" style={{ padding: "12px 20px", display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 0 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: running ? "var(--success)" : "var(--danger)",
            boxShadow: running ? "0 0 12px var(--success-glow), 0 0 24px var(--success-glow)" : "0 0 12px var(--danger-glow)",
            animation: running ? "pulseGlow 2s ease-in-out infinite" : "none",
            display: "inline-block",
          }} />
          <span style={{ fontWeight: 600, color: running ? "var(--success)" : "var(--danger)" }}>
            {running ? "Limor is running" : "Limor is offline"}
          </span>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="card empty-state mt-3">
          No logs yet. Start Limor with <code>npm run dev</code> to see logs here.
        </div>
      ) : (
        <div className="card mt-3" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "4px 0" }}>
            {logs.map((line, i) => (
              <div
                key={i}
                style={{
                  padding: "6px 16px",
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                  fontSize: 12,
                  lineHeight: 1.7,
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  transition: "background 150ms",
                }}
                className="log-row"
              >
                {line.timestamp ? (
                  <>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {new Date(line.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {" "}
                    <span style={{
                      color: LEVEL_COLORS[line.level || ""] || "var(--text-primary)",
                      fontWeight: line.level === "ERROR" ? 700 : 400,
                    }}>
                      {line.level}
                    </span>
                    {" "}
                    <span style={{
                      color: DOMAIN_COLORS[line.domain || ""] || "var(--text-secondary)",
                      fontWeight: 600,
                    }}>
                      [{line.domain}]
                    </span>
                    {" "}
                    <span style={{ color: "var(--text-primary)" }}>
                      {line.message}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>{line.raw}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
