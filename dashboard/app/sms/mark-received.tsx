"use client";

import { useState } from "react";

export function MarkReceivedButton({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "mark_received" }),
      });
      if (res.ok) {
        setDone(true);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  if (done) {
    return <span className="badge badge-approved">Received ✓</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        background: "var(--success)",
        color: "white",
        border: "none",
        borderRadius: "6px",
        padding: "0.4rem 0.8rem",
        cursor: "pointer",
        fontSize: "0.85rem",
      }}
    >
      {loading ? "..." : "✅ קיבלתי"}
    </button>
  );
}
