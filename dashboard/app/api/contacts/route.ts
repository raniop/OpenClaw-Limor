import { NextResponse } from "next/server";
import { getContacts } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getContacts());
}
