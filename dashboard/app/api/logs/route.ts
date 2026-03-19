import { NextRequest, NextResponse } from "next/server";
import { getLogs, isLimorRunning } from "@/lib/data";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = parseInt(params.get("limit") || "200");
  const level = params.get("level") || undefined;
  const domain = params.get("domain") || undefined;

  return NextResponse.json({
    running: isLimorRunning(),
    logs: getLogs(limit, level, domain),
  });
}
