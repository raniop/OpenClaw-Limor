"use client";

import { useState, useEffect } from "react";
import type { ChangelogEntry } from "@/lib/data";

const ACCENT_COLORS = [
  "#667eea", "#f093fb", "#4facfe", "#43e97b", "#fa709a", "#a18cd1", "#fccb90",
];

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((data) => setEntries(data))
      .catch(() => {});
  }, []);

  if (entries.length === 0) {
    return (
      <div>
        <h1>Changelog</h1>
        <h2>Updates & New Features</h2>
        <div className="card empty-state">No changelog entries yet.</div>
      </div>
    );
  }

  const entry = entries[selectedIdx];

  return (
    <div>
      <h1>Changelog</h1>
      <h2>Updates & New Features</h2>

      {/* Navigation between releases */}
      {entries.length > 1 && (
        <div className="changelog-nav">
          {entries.map((e, i) => (
            <button
              key={e.id}
              className={`changelog-nav-btn ${i === selectedIdx ? "active" : ""}`}
              onClick={() => setSelectedIdx(i)}
            >
              <span className="changelog-nav-date">
                {new Date(e.date).toLocaleDateString("he-IL")}
              </span>
              <span className="changelog-nav-title">{e.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Current entry */}
      <div className="changelog-entry">
        <div className="changelog-header">
          <div>
            <div className="changelog-date">
              {new Date(entry.date).toLocaleDateString("he-IL", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            <h3 className="changelog-title">{entry.title}</h3>
            <p className="changelog-subtitle">{entry.subtitle}</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="changelog-stats">
          <div className="changelog-stat">
            <div className="changelog-stat-number">{entry.stats.improvements}</div>
            <div className="changelog-stat-label">IMPROVEMENTS</div>
          </div>
          <div className="changelog-stat">
            <div className="changelog-stat-number">{entry.stats.linesOfCode}</div>
            <div className="changelog-stat-label">LINES OF CODE</div>
          </div>
          <div className="changelog-stat">
            <div className="changelog-stat-number">{entry.stats.files}</div>
            <div className="changelog-stat-label">FILES</div>
          </div>
          <div className="changelog-stat">
            <div className="changelog-stat-number">{entry.stats.tests}</div>
            <div className="changelog-stat-label">TESTS PASS</div>
          </div>
        </div>

        {/* Items */}
        <div className="changelog-items">
          {entry.items.map((item, idx) => {
            const color = ACCENT_COLORS[idx % ACCENT_COLORS.length];
            return (
              <div key={item.number} className="changelog-item" style={{ borderRightColor: color }}>
                <div className="changelog-item-header">
                  <div className="changelog-item-number" style={{ background: `${color}22`, color }}>
                    {item.number}
                  </div>
                  <div className="changelog-item-title">{item.title}</div>
                  <div className="changelog-item-badges">
                    <span className={`changelog-badge ${item.impactHigh ? "impact-high" : "impact-med"}`}>
                      {item.impactHigh ? "High Impact" : "Medium Impact"}
                    </span>
                    <span className={`changelog-badge ${item.complexityLow ? "complexity-low" : "complexity-med"}`}>
                      {item.complexityLow ? "Low Complexity" : "Medium Complexity"}
                    </span>
                  </div>
                </div>
                <div className="changelog-problem">
                  <strong>Problem: </strong>{item.problem}
                </div>
                <div className="changelog-solution">
                  <strong>Solution: </strong>{item.solution}
                </div>
                <div className="changelog-detail">{item.detail}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prev/Next buttons */}
      {entries.length > 1 && (
        <div className="changelog-pager">
          <button
            className="changelog-pager-btn"
            disabled={selectedIdx >= entries.length - 1}
            onClick={() => setSelectedIdx(selectedIdx + 1)}
          >
            Older
          </button>
          <span className="changelog-pager-info">
            {selectedIdx + 1} / {entries.length}
          </span>
          <button
            className="changelog-pager-btn"
            disabled={selectedIdx <= 0}
            onClick={() => setSelectedIdx(selectedIdx - 1)}
          >
            Newer
          </button>
        </div>
      )}
    </div>
  );
}
