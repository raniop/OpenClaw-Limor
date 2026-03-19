import { NextResponse } from "next/server";
import { getActivityLog } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getActivityLog(100));
}
