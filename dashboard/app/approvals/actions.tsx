"use client";

import { useRouter } from "next/navigation";

export function ApprovalActions({ code }: { code: string }) {
  const router = useRouter();

  async function handleAction(action: "approve" | "reject") {
    await fetch(`/api/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, action }),
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
