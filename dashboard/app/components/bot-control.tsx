"use client";

import { useState, useEffect } from "react";

export function BotControl({ initialRunning }: { initialRunning: boolean }) {
  const [running, setRunning] = useState(initialRunning);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<"connected" | "qr" | "waiting" | "offline">("waiting");

  // Poll bot status + QR every 5 seconds
  useEffect(() => {
    async function poll() {
      try {
        const [botRes, qrRes] = await Promise.all([
          fetch("/api/bot"),
          fetch("/api/qr"),
        ]);
        const botData = await botRes.json();
        const qrData = await qrRes.json();

        setRunning(botData.running);
        setWhatsappStatus(qrData.status);

        if (qrData.status === "qr" && qrData.svg) {
          setQrSvg(qrData.svg);
        } else {
          setQrSvg(null);
        }
      } catch {}
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(action: "start" | "stop" | "restart") {
    setLoading(true);
    setError(null);
    setStatusText(action === "start" ? "Building & starting..." : action === "stop" ? "Stopping..." : "Restarting...");
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setRunning(action !== "stop");
        setStatusText(data.message || "");
        setTimeout(() => setStatusText(""), 3000);
      } else {
        setError(data.error || "Failed");
        setStatusText("");
      }
    } catch (e: any) {
      setError(e.message);
      setStatusText("");
    }
    setLoading(false);
  }

  const isConnected = running && whatsappStatus === "connected";
  const needsQR = running && whatsappStatus === "qr";

  return (
    <div>
      <div className="card" style={{ padding: "10px 18px", marginBottom: 0, display: "inline-flex", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: loading ? "var(--warning)" : needsQR ? "var(--warning)" : isConnected ? "var(--success)" : running ? "var(--warning)" : "var(--danger)",
          boxShadow: `0 0 10px ${loading || needsQR ? "var(--warning-glow)" : isConnected ? "var(--success-glow)" : "var(--danger-glow)"}`,
          animation: "pulseGlow 2s ease-in-out infinite",
          display: "inline-block",
          flexShrink: 0,
        }} />
        <span style={{
          fontWeight: 600, fontSize: 13,
          color: loading ? "var(--warning)" : needsQR ? "var(--warning)" : isConnected ? "var(--success)" : running ? "var(--warning)" : "var(--danger)",
        }}>
          {loading ? statusText : needsQR ? "Scan QR" : isConnected ? "Online" : running ? "Connecting..." : "Offline"}
        </span>

        {!running && !loading && (
          <button className="btn btn-approve" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("start")}>
            Start
          </button>
        )}
        {running && !loading && (
          <>
            <button className="btn btn-reject" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("stop")}>
              Stop
            </button>
            <button className="btn btn-action" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => handleAction("restart")}>
              Restart
            </button>
          </>
        )}
        {error && (
          <span className="text-xs text-danger" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{error}</span>
        )}
      </div>

      {/* QR Code display */}
      {needsQR && qrSvg && (
        <div className="card mt-3" style={{ textAlign: "center", padding: "24px" }}>
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>Scan with WhatsApp</div>
          <div style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 12 }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="text-sm text-muted" style={{ marginTop: 12 }}>
            WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
          </div>
        </div>
      )}
    </div>
  );
}
