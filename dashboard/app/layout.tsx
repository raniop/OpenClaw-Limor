import "./globals.css";
import { Inter } from "next/font/google";
import { Sidebar } from "./components/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "OpenClaw Dashboard",
  description: "Limor Control Panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={inter.variable}>
      <body>
        <div className="layout">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
