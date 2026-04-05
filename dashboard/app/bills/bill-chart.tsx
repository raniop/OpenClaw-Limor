"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from "recharts";

interface Bill {
  id: string;
  vendor: string;
  category: string;
  amount: number;
  currency: string;
  periodEnd?: string;
  status: string;
}

interface VendorChartProps {
  bills: Bill[];
  vendor: string;
  color: string;
  emoji: string;
}

const MONTH_NAMES: Record<string, string> = {
  "01": "ינו׳", "02": "פבר׳", "03": "מרץ", "04": "אפר׳",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוג׳",
  "09": "ספט׳", "10": "אוק׳", "11": "נוב׳", "12": "דצמ׳",
};

function formatMonth(iso?: string): string {
  if (!iso) return "?";
  const [year, month] = iso.split("-");
  return `${MONTH_NAMES[month] || month} ${year.slice(2)}`;
}

export function VendorTrendChart({ bills, vendor, color, emoji }: VendorChartProps) {
  // Sort by period ascending
  const sorted = [...bills]
    .filter((b) => b.periodEnd)
    .sort((a, b) => new Date(a.periodEnd!).getTime() - new Date(b.periodEnd!).getTime());

  if (sorted.length < 2) return null;

  const data = sorted.map((b) => ({
    month: formatMonth(b.periodEnd),
    amount: b.amount,
    fullDate: b.periodEnd,
  }));

  const avg = Math.round(sorted.reduce((s, b) => s + b.amount, 0) / sorted.length);
  const min = Math.min(...sorted.map((b) => b.amount));
  const max = Math.max(...sorted.map((b) => b.amount));
  const latest = sorted[sorted.length - 1].amount;
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2].amount : latest;
  const change = latest - prev;
  const changePercent = prev > 0 ? Math.round((change / prev) * 100) : 0;

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      borderRadius: "16px",
      border: "1px solid rgba(255,255,255,0.08)",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "20px" }}>{emoji} {vendor}</h3>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: "14px" }}>
            {sorted.length} חשבונות | ממוצע ₪{avg.toLocaleString("he-IL")}
          </p>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
            <span style={{ color: "#10b981" }}>נמוך: ₪{Math.round(min).toLocaleString("he-IL")}</span>
            <span style={{ color: "#ef4444" }}>גבוה: ₪{Math.round(max).toLocaleString("he-IL")}</span>
          </div>
          <div style={{
            fontSize: "15px",
            fontWeight: 700,
            color: change > 0 ? "#ef4444" : change < 0 ? "#10b981" : "#888",
            marginTop: "4px",
          }}>
            {change > 0 ? "▲" : change < 0 ? "▼" : "—"} {Math.abs(changePercent)}%
            <span style={{ fontWeight: 400, color: "#888", marginRight: "4px" }}>
              מהחודש הקודם
            </span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <defs>
            <linearGradient id={`grad-${vendor}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="month"
            tick={{ fill: "#888", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          />
          <YAxis
            tick={{ fill: "#888", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickFormatter={(v) => `₪${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(30,30,40,0.95)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              color: "#fff",
              direction: "rtl",
            }}
            formatter={(value: any) => [`₪${Number(value).toLocaleString("he-IL")}`, "סכום"]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#grad-${vendor})`}
            dot={{ fill: color, stroke: "#111", strokeWidth: 2, r: 5 }}
            activeDot={{ r: 7, stroke: color, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SpendingOverviewProps {
  vendorData: { vendor: string; total: number; count: number; emoji: string; color: string }[];
}

export function SpendingOverviewChart({ vendorData }: SpendingOverviewProps) {
  if (vendorData.length === 0) return null;

  const data = vendorData
    .sort((a, b) => b.total - a.total)
    .map((v) => ({
      name: v.vendor,
      total: Math.round(v.total),
      avg: Math.round(v.total / v.count),
      color: v.color,
    }));

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      borderRadius: "16px",
      border: "1px solid rgba(255,255,255,0.08)",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <h3 style={{ margin: "0 0 20px", fontSize: "20px" }}>💰 סה״כ הוצאות לפי ספק</h3>
      <ResponsiveContainer width="100%" height={Math.max(150, vendorData.length * 60)}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#888", fontSize: 12 }}
            tickFormatter={(v) => `₪${v.toLocaleString("he-IL")}`}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#ddd", fontSize: 14, fontWeight: 600 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(30,30,40,0.95)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px",
              color: "#fff",
              direction: "rtl",
            }}
            formatter={(value: any, name: any) => {
              const label = name === "total" ? "סה״כ" : "ממוצע";
              return [`₪${Number(value).toLocaleString("he-IL")}`, label];
            }}
          />
          <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={30}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
