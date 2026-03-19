import { NextResponse } from "next/server";
import { getDigestHistory } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getDigestHistory());
}
