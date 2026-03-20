export const dynamic = "force-dynamic";

const CHANNELS = [
  { name: "beforeredalert", label: "🚨 Before Red Alert", description: "התרעות שיגור בזמן אמת", url: "https://t.me/beforeredalert" },
  { name: "almogboker78", label: "📢 אלמוג בוקר", description: "עדכוני חדשות וביטחון", url: "https://t.me/almogboker78" },
];

async function fetchRecentMessages(channelName: string, count: number = 5): Promise<Array<{ id: number; text: string; time: string }>> {
  try {
    const res = await fetch(`https://t.me/s/${channelName}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; dashboard/1.0)" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const results: Array<{ id: number; text: string; time: string }> = [];
    const escaped = channelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const msgPattern = new RegExp(
      `data-post="${escaped}/(\\d+)"[\\s\\S]*?class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)</div>[\\s\\S]*?<time[^>]*datetime="([^"]*)"`,
      "g"
    );
    let match;
    while ((match = msgPattern.exec(html)) !== null) {
      const id = parseInt(match[1], 10);
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      const time = match[3] || "";
      if (text && id) results.push({ id, text, time });
    }
    return results.slice(-count);
  } catch {
    return [];
  }
}

export default async function TelegramPage() {
  const channelData = await Promise.all(
    CHANNELS.map(async (ch) => ({
      ...ch,
      messages: await fetchRecentMessages(ch.name, 8),
    }))
  );

  return (
    <div>
      <h1>📡 Telegram Channels</h1>
      <h2>Monitored channels — forwarded to WhatsApp</h2>

      <div className="grid grid-2 mt-3" style={{ alignItems: "start" }}>
        {channelData.map((ch) => (
          <div key={ch.name}>
            <div className="section-header">
              <a href={ch.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                {ch.label}
              </a>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", borderBottom: "1px solid var(--glass-border)" }}>
                {ch.description} — polling every 15s
              </div>
              {ch.messages.length === 0 ? (
                <div className="empty-state">No recent messages</div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {ch.messages.map((msg) => (
                    <div key={msg.id} style={{ padding: "8px 14px", borderBottom: "1px solid rgba(128,128,128,0.06)", fontSize: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span className="text-xs text-muted">#{msg.id}</span>
                        {msg.time && (
                          <span className="text-xs text-muted">
                            {new Date(msg.time).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                      <div style={{ direction: "rtl", lineHeight: 1.5 }}>{msg.text.substring(0, 300)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3" style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-secondary)" }}>
        <strong>How it works:</strong> Limor scrapes the public Telegram web preview every 15 seconds.
        When a new alert/message appears, it&apos;s forwarded to your WhatsApp instantly.
        beforeredalert is filtered for launch keywords only. אלמוג בוקר forwards everything.
      </div>
    </div>
  );
}
