import { NextRequest, NextResponse } from "next/server";
import { getDailySummaries, getAvailableSummaryDates } from "@/lib/data";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || undefined;

  const summaries = getDailySummaries(date);
  const availableDates = getAvailableSummaryDates();

  return NextResponse.json({
    summaries: summaries?.summaries || [],
    date: summaries?.date || date || null,
    availableDates,
  });
}
