import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("http://localhost:3847", { signal: AbortSignal.timeout(3000) });
    const html = await res.text();

    // Check if QR is showing or already connected
    const hasQR = html.includes("<svg") || html.includes("Scan");
    const connected = html.includes("Connected");

    if (connected) {
      return NextResponse.json({ status: "connected" });
    }

    if (hasQR) {
      // Extract the SVG QR code
      const svgMatch = html.match(/<svg[^]*?<\/svg>/);
      return NextResponse.json({ status: "qr", svg: svgMatch ? svgMatch[0] : null });
    }

    return NextResponse.json({ status: "waiting" });
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
