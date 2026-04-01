import Link from "next/link";

export default function WorldLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide the root layout's sidebar and main-content wrapper */}
      <style>{`
        .layout > .sidebar { display: none !important; }
        .layout > .main-content {
          margin: 0 !important;
          padding: 0 !important;
          max-width: none !important;
          width: 100vw !important;
        }
        .layout {
          display: block !important;
        }
      `}</style>
      <div style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#070810",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 10,
      }}>
        <Link
          href="/"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 100,
            background: "rgba(10, 10, 20, 0.8)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: "8px 16px",
            color: "#ccc",
            textDecoration: "none",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Dashboard <span style={{ fontSize: 18 }}>&#8594;</span>
        </Link>
        {children}
      </div>
    </>
  );
}
