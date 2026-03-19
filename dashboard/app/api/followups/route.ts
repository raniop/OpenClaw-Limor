import { NextRequest, NextResponse } from "next/server";
import { getFollowups, completeFollowup } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getFollowups());
}

export async function POST(request: NextRequest) {
  const { id, action } = await request.json();
  if (!id || action !== "complete") {
    return NextResponse.json({ error: "Missing id or invalid action" }, { status: 400 });
  }

  const success = completeFollowup(id);
  return NextResponse.json({ success });
}
