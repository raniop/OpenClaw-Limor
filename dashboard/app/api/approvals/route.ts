import { NextRequest, NextResponse } from "next/server";
import { getPendingApprovals, approveByCode, rejectByCode } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getPendingApprovals());
}

export async function POST(request: NextRequest) {
  const { code, action } = await request.json();
  if (!code || !action) {
    return NextResponse.json({ error: "Missing code or action" }, { status: 400 });
  }

  const success = action === "approve" ? approveByCode(code) : rejectByCode(code);
  return NextResponse.json({ success });
}
