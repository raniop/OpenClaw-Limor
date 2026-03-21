"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

interface NavItem {
  href: string;
  labelHe: string;
  labelEn: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", labelHe: "לוח בקרה", labelEn: "Dashboard", icon: "◫" },
  { href: "/approvals", labelHe: "אישורים", labelEn: "Approvals", icon: "✓" },
  { href: "/followups", labelHe: "מעקבים", labelEn: "Followups", icon: "⏰" },
  { href: "/activity", labelHe: "פעילות", labelEn: "Activity", icon: "◈" },
  { href: "/capabilities", labelHe: "יכולות", labelEn: "Capabilities", icon: "⚡" },
  { href: "/digests", labelHe: "דיג׳סטים", labelEn: "Digests", icon: "📋" },
  { href: "/summaries", labelHe: "סיכומים", labelEn: "Summaries", icon: "📝" },
  { href: "/contacts", labelHe: "אנשי קשר", labelEn: "Contacts", icon: "👥" },
  { href: "/sms", labelHe: "SMS ומשלוחים", labelEn: "SMS & Deliveries", icon: "📦" },
  { href: "/telegram", labelHe: "טלגרם", labelEn: "Telegram", icon: "📡" },
  { href: "/ops", labelHe: "תפעול ובקרה", labelEn: "Operations", icon: "📊" },
  { href: "/logs", labelHe: "לוגים", labelEn: "Logs", icon: "🔍" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [lang, setLang] = useState<"he" | "en">("he");

  // Persist language preference
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-lang");
    if (saved === "en" || saved === "he") setLang(saved);
  }, []);

  const toggleLang = () => {
    const next = lang === "he" ? "en" : "he";
    setLang(next);
    localStorage.setItem("dashboard-lang", next);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>לימור 🐾</h1>
        <p style={{ fontSize: "12px", color: "var(--color-secondary, #888)", margin: 0 }}>
          {lang === "he" ? "מרכז בקרה" : "Control Panel"}
        </p>
      </div>
      <nav>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : ""}
          >
            <span className="nav-icon">{item.icon}</span>
            {lang === "he" ? item.labelHe : item.labelEn}
          </Link>
        ))}
      </nav>
      <div style={{
        padding: "12px 16px",
        marginTop: "auto",
        borderTop: "1px solid var(--glass-border, #333)",
      }}>
        <button
          onClick={toggleLang}
          style={{
            width: "100%",
            padding: "8px",
            background: "var(--glass-bg, rgba(255,255,255,0.05))",
            border: "1px solid var(--glass-border, #333)",
            borderRadius: "8px",
            color: "var(--text-primary, #fff)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {lang === "he" ? "🌐 English" : "🌐 עברית"}
        </button>
      </div>
    </aside>
  );
}
