"use client";

import { useState, useEffect } from "react";

interface StatusItem {
  label: string;
  status: "ok" | "warning" | "error" | "loading";
  detail: string;
}

export function SystemStatus() {
  const [items, setItems] = useState<StatusItem[]>([
    { label: "Bot", status: "loading", detail: "Checking..." },
    { label: "WhatsApp", status: "loading", detail: "Checking..." },
    { label: "Dashboard", status: "ok", detail: "Running" },
  ]);

  useEffect(() => {
    async function check() {
      try {
        const [botRes, qrRes] = await Promise.all([
          fetch("/api/bot"),
          fetch("/api/qr"),
        ]);
        const bot = await botRes.json();
        const qr = await qrRes.json();

        const newItems: StatusItem[] = [
          {
            label: "Bot Process",
            status: bot.running ? "ok" : "error",
            detail: bot.running ? `PID ${bot.pid || "—"}` : "Offline",
          },
          {
            label: "WhatsApp",
            status: qr.status === "qr" ? "warning" :
                    bot.running && (qr.status === "connected" || qr.status === "offline") ? "ok" :
                    bot.running ? "warning" : "error",
            detail: qr.status === "qr" ? "Needs QR scan" :
                    bot.running && (qr.status === "connected" || qr.status === "offline") ? "Connected" :
                    bot.running ? "Connecting..." : "Offline",
          },
          {
            label: "Dashboard",
            status: "ok",
            detail: "Port 3848",
          },
        ];
        setItems(newItems);
      } catch {
        setItems((prev) => prev.map((i) => i.label === "Dashboard" ? i : { ...i, status: "error" as const, detail: "Check failed" }));
      }
    }

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const STATUS_COLORS = {
    ok: "var(--success)",
    warning: "var(--warning)",
    error: "var(--danger)",
    loading: "var(--text-tertiary)",
  };

  const STATUS_GLOW = {
    ok: "var(--success-glow)",
    warning: "var(--warning-glow)",
    error: "var(--danger-glow)",
    loading: "transparent",
  };

  return (
    <div className="card" style={{ padding: "12px 20px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: STATUS_COLORS[item.status],
            boxShadow: `0 0 8px ${STATUS_GLOW[item.status]}`,
            animation: item.status === "ok" ? "none" : "pulseGlow 2s ease-in-out infinite",
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</span>
          <span style={{ fontSize: 12, color: STATUS_COLORS[item.status] }}>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}
