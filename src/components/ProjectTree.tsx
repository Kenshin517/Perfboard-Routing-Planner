"use client";

import { useState } from "react";

export type ActiveTab = "schematic" | "pcb";

interface Props {
  projectName?: string;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function ProjectTree({
  projectName = "main q22",
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const [expandRoot, setExpandRoot] = useState(true);
  const [expandBoard, setExpandBoard] = useState(true);
  const [expandSchematic, setExpandSchematic] = useState(true);

  if (collapsed) {
    return (
      <div style={collapsedSidebar}>
        <button
          onClick={onToggleCollapse}
          style={collapseToggleBtn}
          title="Buka Project Explorer"
        >
          📁
        </button>
        <div style={verticalDivider} />
        <button
          onClick={() => onSelectTab("schematic")}
          style={{ ...iconOnlyBtn, ...(activeTab === "schematic" ? activeIconBtn : {}) }}
          title="Schematic1 (1. P1)"
        >
          ⚡
        </button>
        <button
          onClick={() => onSelectTab("pcb")}
          style={{ ...iconOnlyBtn, ...(activeTab === "pcb" ? activeIconBtn : {}) }}
          title="PCB1 (Perfboard Bolong)"
        >
          🟩
        </button>
      </div>
    );
  }

  return (
    <aside style={treeContainer}>
      {/* Top Header */}
      <div style={treeHeader}>
        <div style={headerTitleGroup}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#a0b3c6">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          <span style={treeHeaderText}>PROJECT EXPLORER</span>
        </div>
        {onToggleCollapse && (
          <button onClick={onToggleCollapse} style={hideBtn} title="Sembunyikan Explorer">
            ‹
          </button>
        )}
      </div>

      {/* Tree Content (Matches Image 1) */}
      <div style={treeBody}>
        {/* Root Project Folder: main q22 */}
        <div style={treeNodeRow}>
          <button
            onClick={() => setExpandRoot((v) => !v)}
            style={expandBtn}
          >
            {expandRoot ? "⊟" : "⊞"}
          </button>
          <span style={folderIcon}>📁</span>
          <span style={projectLabel}>{projectName}</span>
        </div>

        {expandRoot && (
          <div style={indentBranch}>
            {/* Board1 */}
            <div style={treeNodeRow}>
              <button
                onClick={() => setExpandBoard((v) => !v)}
                style={expandBtn}
              >
                {expandBoard ? "⊟" : "⊞"}
              </button>
              {/* Green Board icon */}
              <div style={greenBoardIcon}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect width="16" height="16" rx="2" fill="#1b8536" />
                  <circle cx="4" cy="4" r="1.5" fill="#a1e3b1" />
                  <circle cx="12" cy="12" r="1.5" fill="#a1e3b1" />
                  <path d="M4 4L12 12" stroke="#a1e3b1" strokeWidth="1.2" />
                </svg>
              </div>
              <span style={nodeTitle}>Board1</span>
            </div>

            {expandBoard && (
              <div style={indentBranch}>
                {/* Schematic1 */}
                <div style={treeNodeRow}>
                  <button
                    onClick={() => setExpandSchematic((v) => !v)}
                    style={expandBtn}
                  >
                    {expandSchematic ? "⊟" : "⊞"}
                  </button>
                  {/* Schematic symbol icon */}
                  <div style={schematicIcon}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <rect x="1" y="4" width="6" height="8" stroke="#3ba3ec" strokeWidth="1.4" fill="none" />
                      <line x1="7" y1="8" x2="15" y2="8" stroke="#3ba3ec" strokeWidth="1.4" />
                      <rect x="9" y="4" width="6" height="8" stroke="#3ba3ec" strokeWidth="1.4" fill="none" />
                    </svg>
                  </div>
                  <span style={nodeTitle}>Schematic1</span>
                </div>

                {expandSchematic && (
                  <div style={indentBranch}>
                    {/* 1. P1 (Sheet) */}
                    <div
                      style={{
                        ...leafRow,
                        ...(activeTab === "schematic" ? activeLeafRow : {}),
                      }}
                      onClick={() => onSelectTab("schematic")}
                      title="Buka Skematik Sheet 1 (P1)"
                    >
                      <span style={docIcon}>📄</span>
                      <span style={leafTitle}>1. P1</span>
                      {activeTab === "schematic" && <span style={activeDot}>●</span>}
                    </div>
                  </div>
                )}

                {/* PCB1 (Perfboard) */}
                <div
                  style={{
                    ...leafRow,
                    ...(activeTab === "pcb" ? activeLeafRow : {}),
                  }}
                  onClick={() => onSelectTab("pcb")}
                  title="Buka PCB1 (Board PCB Bolong)"
                >
                  <div style={greenPcbIcon}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect width="16" height="16" rx="2" fill="#1b8536" />
                      <circle cx="5" cy="5" r="1.5" fill="#a1e3b1" />
                      <circle cx="11" cy="5" r="1.5" fill="#a1e3b1" />
                      <circle cx="5" cy="11" r="1.5" fill="#a1e3b1" />
                      <circle cx="11" cy="11" r="1.5" fill="#a1e3b1" />
                    </svg>
                  </div>
                  <span style={leafTitle}>PCB1 (Perfboard)</span>
                  {activeTab === "pcb" && <span style={activeDot}>●</span>}
                </div>

                {/* Panel1 */}
                <div style={{ ...leafRow, opacity: 0.6 }} title="Paneling (Opsional)">
                  <div style={bluePanelIcon}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect width="16" height="16" rx="2" fill="#1976d2" />
                      <circle cx="8" cy="8" r="2" fill="#bbdefb" />
                    </svg>
                  </div>
                  <span style={leafTitle}>Panel1</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── STYLES ────────────────────────────────────────────────────────── */

const treeContainer: React.CSSProperties = {
  width: 210,
  minWidth: 190,
  background: "#1e1e1e",
  borderRight: "1px solid #333333",
  color: "#cccccc",
  display: "flex",
  flexDirection: "column",
  fontSize: 13,
  userSelect: "none",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Roboto, sans-serif",
};

const treeHeader: React.CSSProperties = {
  padding: "8px 12px",
  background: "#252526",
  borderBottom: "1px solid #333333",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerTitleGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const treeHeaderText: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#999999",
  letterSpacing: "0.06em",
};

const hideBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888888",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 4px",
};

const treeBody: React.CSSProperties = {
  padding: "10px 8px",
  overflowY: "auto",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const treeNodeRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 4px",
  borderRadius: 4,
  cursor: "pointer",
};

const expandBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#888888",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
  width: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const folderIcon: React.CSSProperties = {
  fontSize: 14,
};

const projectLabel: React.CSSProperties = {
  fontWeight: 600,
  color: "#f5a623",
  background: "#3e2723",
  padding: "1px 6px",
  borderRadius: 3,
  fontSize: 12,
};

const indentBranch: React.CSSProperties = {
  marginLeft: 14,
  paddingLeft: 8,
  borderLeft: "1px dotted #444444",
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const nodeTitle: React.CSSProperties = {
  color: "#e0e0e0",
  fontSize: 13,
  fontWeight: 500,
};

const leafRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 6px",
  borderRadius: 4,
  cursor: "pointer",
  color: "#cccccc",
  transition: "all 0.15s ease",
};

const activeLeafRow: React.CSSProperties = {
  background: "#094771",
  color: "#ffffff",
  fontWeight: 600,
};

const leafTitle: React.CSSProperties = {
  fontSize: 12.5,
  flex: 1,
};

const docIcon: React.CSSProperties = {
  fontSize: 13,
};

const greenBoardIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const greenPcbIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const schematicIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const bluePanelIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const activeDot: React.CSSProperties = {
  color: "#4fc3f7",
  fontSize: 10,
};

const collapsedSidebar: React.CSSProperties = {
  width: 44,
  background: "#1e1e1e",
  borderRight: "1px solid #333333",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 0",
  gap: 8,
};

const collapseToggleBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const verticalDivider: React.CSSProperties = {
  width: 24,
  height: 1,
  background: "#333333",
  margin: "4px 0",
};

const iconOnlyBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "6px",
  borderRadius: 4,
  fontSize: 14,
};

const activeIconBtn: React.CSSProperties = {
  background: "#094771",
};
