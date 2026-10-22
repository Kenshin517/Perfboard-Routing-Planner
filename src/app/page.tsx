"use client";

import { useMemo, useState } from "react";
import { createBoard } from "@/engine/BoardEngine";
import PerfboardCanvas from "@/components/PerfboardCanvas";

export default function Home() {
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(20);
  const [resetToken, setResetToken] = useState(0);

  // Rebuild the engine whenever the board size changes.
  const engine = useMemo(() => createBoard({ cols, rows }), [cols, rows]);

  const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n || 1)));

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          background: "var(--panel)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <strong style={{ fontSize: 15 }}>Perfboard Routing Planner</strong>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>
          {cols} × {rows} holes &middot; {engine.holeCount()} total &middot; 2.54mm
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>
            Cols{" "}
            <input
              type="number"
              min={1}
              max={100}
              value={cols}
              onChange={(e) => setCols(clamp(Number(e.target.value)))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13, color: "var(--muted)" }}>
            Rows{" "}
            <input
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(clamp(Number(e.target.value)))}
              style={inputStyle}
            />
          </label>
          <button onClick={() => setResetToken((t) => t + 1)} style={btnStyle}>
            Reset view
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <PerfboardCanvas engine={engine} resetToken={resetToken} />
      </div>

      <footer style={{ padding: "6px 16px", fontSize: 12, color: "var(--muted)", background: "var(--panel)", borderTop: "1px solid var(--border)" }}>
        Scroll to zoom &middot; drag to pan &middot; ticket 01: board skeleton
      </footer>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: 56,
  padding: "4px 6px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
};

const btnStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  cursor: "pointer",
};
