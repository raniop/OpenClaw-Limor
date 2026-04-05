"use client";

import { useState } from "react";

interface MarkPaidButtonProps {
  billId: string;
  vendor: string;
  amount: number;
  currency: string;
}

export function MarkPaidButton({ billId, vendor, amount, currency }: MarkPaidButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: billId, action: "mark_paid" }),
      });
      if (res.ok) {
        setDone(true);
        // Refresh page after short delay
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      console.error("Failed to mark paid:", err);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <span style={{
        color: "#10b981",
        fontWeight: 600,
        fontSize: "13px",
      }}>
        ✅ שולם!
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: "6px 14px",
        background: loading ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.15)",
        color: "#818cf8",
        border: "1px solid rgba(99, 102, 241, 0.3)",
        borderRadius: "8px",
        cursor: loading ? "wait" : "pointer",
        fontSize: "13px",
        fontWeight: 600,
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
      onMouseOver={(e) => {
        if (!loading) {
          (e.target as HTMLElement).style.background = "rgba(99, 102, 241, 0.3)";
          (e.target as HTMLElement).style.borderColor = "rgba(99, 102, 241, 0.5)";
        }
      }}
      onMouseOut={(e) => {
        if (!loading) {
          (e.target as HTMLElement).style.background = "rgba(99, 102, 241, 0.15)";
          (e.target as HTMLElement).style.borderColor = "rgba(99, 102, 241, 0.3)";
        }
      }}
    >
      {loading ? "..." : "💳 סמן כשולם"}
    </button>
  );
}
