"use client";

import { useState } from "react";

/** Standard perfboard hole pitch = 2.54 mm. */
const PITCH_MM = 2.54;

export interface BoardSizeOption {
  label: string;
  widthCm: number;
  heightCm: number;
  cols: number;
  rows: number;
  category: "small" | "medium" | "large";
}

const raw: { widthCm: number; heightCm: number; category: "small" | "medium" | "large" }[] = [
  { widthCm: 2, heightCm: 8, category: "small" },
  { widthCm: 3, heightCm: 7, category: "small" },
  { widthCm: 4, heightCm: 6, category: "small" },
  { widthCm: 5, heightCm: 7, category: "medium" },
  { widthCm: 7, heightCm: 9, category: "medium" },
  { widthCm: 7, heightCm: 18, category: "medium" },
  { widthCm: 8, heightCm: 12, category: "medium" },
  { widthCm: 9, heightCm: 15, category: "large" },
  { widthCm: 12, heightCm: 18, category: "large" },
  { widthCm: 18, heightCm: 30, category: "large" },
];

export const BOARD_SIZES: BoardSizeOption[] = raw.map((s) => ({
  ...s,
  label: `${s.widthCm} × ${s.heightCm} cm`,
  cols: Math.floor((s.widthCm * 10) / PITCH_MM),
  rows: Math.floor((s.heightCm * 10) / PITCH_MM),
}));

interface Props {
  onSelect: (cols: number, rows: number) => void;
  onBack?: () => void;
}

/* ── Realistic Green PCB Board Preview ────────────────────────────── */
function BoardPreview({
  widthCm,
  heightCm,
  maxSide,
}: {
  widthCm: number;
  heightCm: number;
  maxSide: number;
}) {
  const aspect = widthCm / heightCm;
  let w: number, h: number;
  if (aspect >= 1) {
    w = maxSide;
    h = maxSide / aspect;
  } else {
    h = maxSide;
    w = maxSide * aspect;
  }
  // Fit representative holes
  const dotCols = Math.min(Math.round(w / 6), 14);
  const dotRows = Math.min(Math.round(h / 6), 14);
  const gapX = w / (dotCols + 1);
  const gapY = h / (dotRows + 1);

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={3.5}
        fill="#1e6b35"
        stroke="#145226"
        strokeWidth={1}
      />
      {Array.from({ length: dotRows }).map((_, r) =>
        Array.from({ length: dotCols }).map((_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={gapX * (c + 1)}
            cy={gapY * (r + 1)}
            r={1.3}
            fill="#e2e8f0"
            opacity={0.8}
          />
        )),
      )}
    </svg>
  );
}

/* ── Main Selector Component (Clean Light / White Theme) ─────────── */

export default function BoardSizeSelector({ onSelect, onBack }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const small = BOARD_SIZES.filter((s) => s.category === "small");
  const medium = BOARD_SIZES.filter((s) => s.category === "medium");
  const large = BOARD_SIZES.filter((s) => s.category === "large");

  const renderCard = (size: BoardSizeOption, idx: number) => {
    const isHovered = hovered === idx;
    return (
      <button
        key={idx}
        style={{
          ...card,
          borderColor: isHovered ? "#289ee0" : "#d2e0ee",
          background: isHovered ? "#f0f7fe" : "#ffffff",
          transform: isHovered ? "translateY(-2px)" : "none",
          boxShadow: isHovered
            ? "0 6px 16px rgba(40, 158, 224, 0.18)"
            : "0 2px 6px rgba(18, 48, 77, 0.05)",
        }}
        onMouseEnter={() => setHovered(idx)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => onSelect(size.cols, size.rows)}
      >
        <div style={previewWrap}>
          <BoardPreview widthCm={size.widthCm} heightCm={size.heightCm} maxSide={64} />
        </div>
        <div style={labelRow}>
          <span style={dimText}>
            {size.widthCm} × {size.heightCm}
          </span>
          <span style={unitText}>cm</span>
        </div>
        <span style={holeText}>
          {size.cols}×{size.rows} lubang
        </span>
      </button>
    );
  };

  let idx = 0;
  const indexedSmall = small.map((s) => ({ size: s, idx: idx++ }));
  const indexedMedium = medium.map((s) => ({ size: s, idx: idx++ }));
  const indexedLarge = large.map((s) => ({ size: s, idx: idx++ }));

  return (
    <div style={page}>
      {/* ── Top Navigation Bar ── */}
      <div style={topBar}>
        <div style={breadcrumbRow}>
          {onBack ? (
            <button onClick={onBack} style={breadcrumbLink}>
              Home
            </button>
          ) : (
            <span style={breadcrumbLink}>Home</span>
          )}
          <span style={breadcrumbSep}>›</span>
          <span style={breadcrumbCurrent}>Pilih Ukuran Board</span>
        </div>

        {onBack && (
          <button onClick={onBack} style={backBtn}>
            ← Kembali ke Menu Utama
          </button>
        )}
      </div>

      {/* ── Content Container ── */}
      <div style={contentWrap}>
        {/* Header */}
        <div style={header}>
          <h1 style={titleStyle}>Pilih Ukuran Board</h1>
          <p style={desc}>
            Mau pakai board PCB bolong yang ukuran berapa?
            <br />
            <span style={descSub}>Tenang, ukuran bisa disesuaikan lagi nanti di editor.</span>
          </p>
        </div>

        {/* Sections by size category */}
        <div style={sections}>
          <Section title="Kecil" subtitle="Buat project simpel / modul kecil">
            {indexedSmall.map(({ size, idx: i }) => renderCard(size, i))}
          </Section>
          <Section title="Sedang" subtitle="Paling sering dipakai">
            {indexedMedium.map(({ size, idx: i }) => renderCard(size, i))}
          </Section>
          <Section title="Besar" subtitle="Project besar / banyak komponen">
            {indexedLarge.map(({ size, idx: i }) => renderCard(size, i))}
          </Section>
        </div>

        <p style={footer}>
          Pitch standar 2.54 mm &middot; Ukuran bisa diubah di toolbar editor nanti
        </p>
      </div>
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div style={section}>
      <div style={sectionHeader}>
        <span style={sectionTitle}>{title}</span>
        <span style={sectionSub}>{subtitle}</span>
      </div>
      <div style={row}>{children}</div>
    </div>
  );
}

/* ── Light / White Styles ─────────────────────────────────────────── */

const page: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  background: "#f4f8fc",
  color: "#182c40",
  overflowY: "auto",
  zIndex: 100,
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Roboto, sans-serif",
};

const topBar: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  borderBottom: "1px solid #c7d8e8",
  padding: "10px 28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  boxShadow: "0 1px 4px rgba(18, 48, 77, 0.04)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const breadcrumbRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
};

const breadcrumbLink: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#166ba2",
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  fontSize: 14,
};

const breadcrumbSep: React.CSSProperties = {
  color: "#8fa3b7",
  fontSize: 16,
};

const breadcrumbCurrent: React.CSSProperties = {
  color: "#46596b",
  fontWeight: 500,
};

const backBtn: React.CSSProperties = {
  background: "#f4f8fc",
  border: "1px solid #c7d8e8",
  color: "#166ba2",
  padding: "6px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.15s ease",
};

const contentWrap: React.CSSProperties = {
  width: "100%",
  maxWidth: 820,
  padding: "36px 24px 48px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const header: React.CSSProperties = {
  textAlign: "center",
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  color: "#122a44",
  letterSpacing: "-0.01em",
};

const desc: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 15,
  color: "#54687d",
  lineHeight: 1.5,
};

const descSub: React.CSSProperties = {
  fontSize: 13,
  color: "#74889c",
};

const sections: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
  width: "100%",
  marginTop: 28,
};

const section: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  paddingLeft: 2,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#122a44",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sectionSub: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7d90",
};

const row: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 14,
};

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  padding: "16px 20px 14px",
  border: "1px solid #d2e0ee",
  borderRadius: 10,
  cursor: "pointer",
  transition: "all 0.15s ease",
  outline: "none",
  background: "#ffffff",
  minWidth: 120,
};

const previewWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 72,
  height: 72,
};

const labelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 4,
};

const dimText: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#122a44",
};

const unitText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#6b7d90",
};

const holeText: React.CSSProperties = {
  fontSize: 12,
  color: "#718598",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const footer: React.CSSProperties = {
  marginTop: 36,
  fontSize: 13,
  color: "#74889c",
  textAlign: "center",
};
