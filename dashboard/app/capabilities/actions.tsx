"use client";

import { useRouter } from "next/navigation";

export function CapabilityActions({ id }: { id: string }) {
  const router = useRouter();

  async function handleAction(action: "approve" | "reject") {
    await fetch(`/api/capabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    router.refresh();
  }

  return (
    <div className="gap-2">
      <button className="btn btn-approve" onClick={() => handleAction("approve")}>Approve</button>
      <button className="btn btn-reject" onClick={() => handleAction("reject")}>Reject</button>
    </div>
  );
}
