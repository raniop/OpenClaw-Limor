"use client";

import { useRouter } from "next/navigation";

export function FollowupActions({ id }: { id: string }) {
  const router = useRouter();

  async function handleComplete() {
    await fetch(`/api/followups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "complete" }),
    });
    router.refresh();
  }

  return (
    <button className="btn btn-action" onClick={handleComplete}>Complete</button>
  );
}
