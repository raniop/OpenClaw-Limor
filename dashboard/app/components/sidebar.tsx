"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "◫" },
  { href: "/approvals", label: "Approvals", icon: "✓" },
  { href: "/followups", label: "Followups", icon: "⏱" },
  { href: "/activity", label: "Activity", icon: "◈" },
  { href: "/capabilities", label: "Capabilities", icon: "⚡" },
  { href: "/digests", label: "Digests", icon: "📋" },
  { href: "/summaries", label: "Summaries", icon: "💬" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/sms", label: "SMS & Deliveries", icon: "📦" },
  { href: "/telegram", label: "Telegram", icon: "📡" },
  { href: "/ops", label: "Operations", icon: "🔬" },
  { href: "/logs", label: "Logs", icon: "📟" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0 }}>לימור 🐾</h1>
        <p style={{ fontSize: "12px", color: "var(--color-secondary, #888)", margin: 0 }}>מרכז בקרה</p>
      </div>
      <nav>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : ""}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
