import { NextRequest, NextResponse } from "next/server";
import { getCapabilities, approveCapability, rejectCapability } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getCapabilities());
}

export async function POST(request: NextRequest) {
  const { id, action } = await request.json();
  if (!id || !action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  const success = action === "approve" ? approveCapability(id) : rejectCapability(id);
  return NextResponse.json({ success });
}
