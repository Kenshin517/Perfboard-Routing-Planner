"use client";

import { useRef, useState, useEffect } from "react";
import { getRecentProjects, removeRecentProject, type RecentProjectItem } from "@/storage/projectStorage";
import { EXAMPLES, type ProjectExample } from "@/storage/examples";
import type { SerializedProject } from "@/engine/BoardEngine";

interface Props {
  onSelectBoard: () => void;
  onLoadProject: (data: SerializedProject, name?: string) => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportNetlist: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hasActiveProject?: boolean;
  onResumeActive?: () => void;
}

export default function HomeDashboard({
  onSelectBoard,
  onLoadProject,
  onImportFile,
  onImportNetlist,
  hasActiveProject,
  onResumeActive,
}: Props) {
  const [recentList, setRecentList] = useState<RecentProjectItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    setRecentList(getRecentProjects());
    setMounted(true);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const netlistInputRef = useRef<HTMLInputElement>(null);

  const handleSelectRecent = (item: RecentProjectItem) => {
    onLoadProject(item.data, item.name);
  };

  const handleRemoveRecent = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = removeRecentProject(id);
    setRecentList(updated);
  };

  const handleLoadExample = (example: ProjectExample) => {
    onLoadProject(example.project, example.filename);
    setShowExamplesModal(false);
  };

  return (
    <div style={containerStyle}>
      {/* ── Top Window Bar (STM32CubeMX Style) ────────────────────────── */}
      <header style={topWindowBar}>
        <div style={brandArea}>
          {/* Logo icon resembling STM32 Cube / Perfboard IC */}
          <div style={cubeIconWrapper}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
                fill="#2ca9e1"
                stroke="#1b7fb3"
                strokeWidth="1.5"
              />
              <path
                d="M16 2L28 9L16 16L4 9L16 2Z"
                fill="#55c1f0"
              />
              <path
                d="M16 16V30L28 23V9L16 16Z"
                fill="#218ec0"
              />
              <path
                d="M16 16V30L4 23V9L16 16Z"
                fill="#1674a0"
              />
              <circle cx="16" cy="16" r="2.5" fill="#ffffff" />
            </svg>
          </div>
          <div style={titleTextGroup}>
            <span style={brandSub}>Perfboard Routing Planner</span>
            <span style={windowTitle}>Untitled</span>
          </div>
        </div>

        {/* Menu Bar */}
        <nav style={menuBar}>
          <div style={menuItemWrapper}>
            <button
              style={{ ...menuBtn, ...(activeMenu === "File" ? menuBtnActive : {}) }}
              onClick={() => setActiveMenu((m) => (m === "File" ? null : "File"))}
            >
              File
            </button>
            {activeMenu === "File" && (
              <div style={dropdownMenu}>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    onSelectBoard();
                  }}
                >
                  New Project (Board Selector)
                </button>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    fileInputRef.current?.click();
                  }}
                >
                  Open Project File...
                </button>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    netlistInputRef.current?.click();
                  }}
                >
                  Import KiCad Netlist...
                </button>
                {hasActiveProject && onResumeActive && (
                  <>
                    <div style={dropdownDivider} />
                    <button
                      style={dropdownItem}
                      onClick={() => {
                        setActiveMenu(null);
                        onResumeActive();
                      }}
                    >
                      Resume Current Project →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={menuItemWrapper}>
            <button
              style={{ ...menuBtn, ...(activeMenu === "Window" ? menuBtnActive : {}) }}
              onClick={() => setActiveMenu((m) => (m === "Window" ? null : "Window"))}
            >
              Window
            </button>
            {activeMenu === "Window" && (
              <div style={dropdownMenu}>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    onSelectBoard();
                  }}
                >
                  Board Size Selector
                </button>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    setShowExamplesModal(true);
                  }}
                >
                  Examples Library
                </button>
              </div>
            )}
          </div>

          <div style={menuItemWrapper}>
            <button
              style={{ ...menuBtn, ...(activeMenu === "Help" ? menuBtnActive : {}) }}
              onClick={() => setActiveMenu((m) => (m === "Help" ? null : "Help"))}
            >
              Help
            </button>
            {activeMenu === "Help" && (
              <div style={dropdownMenu}>
                <button
                  style={dropdownItem}
                  onClick={() => {
                    setActiveMenu(null);
                    alert("Perfboard Routing Planner\nTool web untuk merancang jalur wiring di PCB bolong.");
                  }}
                >
                  About Perfboard Planner
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* ── Subheader ribbon: Dark Blue "Home >" ───────────────────── */}
      <div style={breadcrumbBar}>
        <div style={breadcrumbItem}>
          <span>Home</span>
          <svg width="14" height="20" viewBox="0 0 14 20" style={{ display: "inline-block" }}>
            <path d="M0,0 L10,10 L0,20" fill="none" stroke="#2ea5ea" strokeWidth="2.5" />
          </svg>
        </div>

        {hasActiveProject && onResumeActive && (
          <button onClick={onResumeActive} style={resumeHeaderBtn}>
            Kembali ke Project Aktif →
          </button>
        )}
      </div>

      {/* ── Main Content Area (Light Blue STM32 style) ─────────────── */}
      <div style={mainContentArea} onClick={() => setActiveMenu(null)}>
        <div style={gridContainer}>
          {/* ── Left Column: Existing Projects ── */}
          <section style={leftColumn}>
            <h2 style={sectionHeader}>Existing Projects</h2>

            <div style={existingCard}>
              <h3 style={subHeader}>Recent Opened Projects</h3>

              <div style={recentListContainer}>
                {!mounted ? (
                  <div style={emptyRecent}>Memuat recent projects...</div>
                ) : recentList.length === 0 ? (
                  <div style={emptyRecent}>Belum ada project yang baru dibuka.</div>
                ) : (
                  recentList.map((item) => (
                    <div
                      key={item.id}
                      style={recentRow}
                      onClick={() => handleSelectRecent(item)}
                      title={`Buka ${item.name}`}
                    >
                      <div style={recentTextCol}>
                        <span style={projectName}>{item.name}</span>
                        <span style={projectDate}>
                          Last modified date : {item.lastModified}
                        </span>
                      </div>

                      <div style={badgeContainer}>
                        {/* Blue square badge "PB" matching STM32CubeMX "MX" */}
                        <div style={mxBadge} title="Perfboard Project">
                          PB
                        </div>
                        <button
                          style={removeBtn}
                          onClick={(e) => handleRemoveRecent(e, item.id)}
                          title="Hapus dari recent list"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Other Projects section */}
              <div style={otherProjectsSection}>
                <h3 style={otherHeader}>Other Projects</h3>
                <button
                  style={otherProjectsBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div style={folderIconWrap}>
                    <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
                      <path
                        d="M3 6C3 4.89543 3.89543 4 5 4H12L15 8H27C28.1046 8 29 8.89543 29 10V24C29 25.1046 28.1046 26 27 26H5C3.89543 26 3 25.1046 3 24V6Z"
                        fill="#54b8ea"
                      />
                      <circle cx="21" cy="18" r="5" stroke="#ffffff" strokeWidth="2" fill="#218ec0" />
                      <line x1="24.5" y1="21.5" x2="28" y2="25" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={otherTextGroup}>
                    <span style={otherBtnTitle}>Open Project from File (.json / .pbrp)</span>
                    <span style={otherBtnSub}>Cari file project tersimpan di komputer Anda</span>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* ── Right Column: New Project ── */}
          <section style={rightColumn}>
            <h2 style={sectionHeader}>New Project</h2>

            <div style={newProjectNavyCard}>
              <h3 style={iNeedToTitle}>I need to :</h3>
              <div style={navyDivider} />

              {/* Option 1: Start My project from Perfboard Size */}
              <div style={navyOptionBlock}>
                <span style={navyOptionLabel}>
                  Start My project from Perfboard Size
                </span>
                <button style={cyanAccessBtn} onClick={onSelectBoard}>
                  ACCESS TO BOARD SELECTOR
                </button>
              </div>

              <div style={navyDivider} />

              {/* Option 2: Start My project from KiCad Netlist */}
              <div style={navyOptionBlock}>
                <span style={navyOptionLabel}>
                  Start My project from KiCad Netlist
                </span>
                <button
                  style={cyanAccessBtn}
                  onClick={() => netlistInputRef.current?.click()}
                >
                  ACCESS TO NETLIST SELECTOR
                </button>
              </div>

              <div style={navyDivider} />

              {/* Option 3: Start My project from Example */}
              <div style={navyOptionBlock}>
                <span style={navyOptionLabel}>
                  Start My project from Example
                </span>
                <button
                  style={cyanAccessBtn}
                  onClick={() => setShowExamplesModal(true)}
                >
                  ACCESS TO EXAMPLE SELECTOR
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Hidden file pickers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json,.pbrp"
        onChange={onImportFile}
        style={{ display: "none" }}
      />
      <input
        ref={netlistInputRef}
        type="file"
        accept=".net,.xml,.txt"
        onChange={onImportNetlist}
        style={{ display: "none" }}
      />

      {/* ── Example Selector Modal ─────────────────────────────────── */}
      {showExamplesModal && (
        <div style={modalOverlay} onClick={() => setShowExamplesModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Starter Project Examples</h3>
                <p style={modalSub}>Pilih contoh sirkuit siap pakai untuk langsung mulai routing</p>
              </div>
              <button style={modalCloseBtn} onClick={() => setShowExamplesModal(false)}>
                ×
              </button>
            </div>

            <div style={examplesGrid}>
              {EXAMPLES.map((ex) => (
                <div key={ex.id} style={exampleCard}>
                  <div style={exampleCardHeader}>
                    <span style={exampleCardTitle}>{ex.name}</span>
                    <span style={exampleBadge}>{ex.boardSize}</span>
                  </div>
                  <p style={exampleDesc}>{ex.description}</p>
                  <div style={exampleCardFooter}>
                    <span style={examplePartsCount}>
                      {ex.project.state.components.length} komponen &middot; {ex.project.state.nets.length} net
                    </span>
                    <button style={loadExampleBtn} onClick={() => handleLoadExample(ex)}>
                      Buka Example →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── STYLES (Matching STM32CubeMX) ─────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "#e4edf5",
  color: "#1c2e42",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Roboto, sans-serif",
  zIndex: 90,
  overflowY: "auto",
};

const topWindowBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 20px",
  background: "#ffffff",
  borderBottom: "1px solid #c7d8e8",
  height: 52,
};

const brandArea: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const cubeIconWrapper: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const titleTextGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const brandSub: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#166ba2",
  letterSpacing: "-0.01em",
};

const windowTitle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7c90",
};

const menuBar: React.CSSProperties = {
  display: "flex",
  gap: 20,
};

const menuItemWrapper: React.CSSProperties = {
  position: "relative",
};

const menuBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#1d3249",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: 4,
};

const menuBtnActive: React.CSSProperties = {
  background: "#e1eef9",
  color: "#156fa8",
};

const dropdownMenu: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  background: "#ffffff",
  border: "1px solid #bfd3e6",
  borderRadius: 6,
  boxShadow: "0 6px 18px rgba(18, 48, 77, 0.15)",
  minWidth: 220,
  zIndex: 200,
  display: "flex",
  flexDirection: "column",
  padding: "4px 0",
};

const dropdownItem: React.CSSProperties = {
  background: "none",
  border: "none",
  textAlign: "left",
  padding: "8px 16px",
  fontSize: 13,
  color: "#1d3249",
  cursor: "pointer",
  width: "100%",
};

const dropdownDivider: React.CSSProperties = {
  height: 1,
  background: "#e2ecf5",
  margin: "4px 0",
};

const breadcrumbBar: React.CSSProperties = {
  background: "#082142",
  color: "#ffffff",
  padding: "0 24px",
  height: 38,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.1)",
};

const breadcrumbItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const resumeHeaderBtn: React.CSSProperties = {
  background: "#1e88e5",
  color: "#ffffff",
  border: "none",
  borderRadius: 4,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const mainContentArea: React.CSSProperties = {
  flex: 1,
  padding: "28px 40px",
  display: "flex",
  justifyContent: "center",
};

const gridContainer: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  display: "grid",
  gridTemplateColumns: "1.25fr 1fr",
  gap: 40,
  alignItems: "start",
};

const leftColumn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const rightColumn: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionHeader: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#13273e",
};

const existingCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const subHeader: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#163354",
};

const recentListContainer: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxHeight: 380,
  overflowY: "auto",
};

const emptyRecent: React.CSSProperties = {
  padding: "24px",
  textAlign: "center",
  color: "#728498",
  background: "#f4f8fc",
  borderRadius: 6,
  border: "1px dashed #c0d3e5",
};

const recentRow: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d2e0ee",
  borderRadius: 4,
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  transition: "all 0.15s ease",
  boxShadow: "0 1px 3px rgba(18, 48, 77, 0.05)",
};

const recentTextCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const projectName: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#14304e",
};

const projectDate: React.CSSProperties = {
  fontSize: 12,
  fontStyle: "italic",
  color: "#546a80",
};

const badgeContainer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const mxBadge: React.CSSProperties = {
  width: 38,
  height: 38,
  background: "#319be2",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 3,
  letterSpacing: "0.05em",
  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
};

const removeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#9ab0c4",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  padding: "0 4px",
};

const otherProjectsSection: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const otherHeader: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "#163354",
};

const otherProjectsBtn: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d2e0ee",
  borderRadius: 6,
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  cursor: "pointer",
  textAlign: "left",
  boxShadow: "0 1px 3px rgba(18, 48, 77, 0.05)",
};

const folderIconWrap: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const otherTextGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const otherBtnTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#133150",
};

const otherBtnSub: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7d90",
};

/* ── Navy Blue Card (Right Column) ─────────────────────────────────── */

const newProjectNavyCard: React.CSSProperties = {
  background: "#082142",
  borderRadius: 4,
  padding: "24px 28px",
  color: "#ffffff",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  boxShadow: "0 4px 16px rgba(8, 33, 66, 0.25)",
};

const iNeedToTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#ffffff",
};

const navyDivider: React.CSSProperties = {
  height: 1,
  background: "rgba(255, 255, 255, 0.2)",
};

const navyOptionBlock: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const navyOptionLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#ffffff",
};

const cyanAccessBtn: React.CSSProperties = {
  background: "#289ee0",
  border: "1px dashed rgba(255, 255, 255, 0.6)",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: "0.04em",
  padding: "9px 16px",
  borderRadius: 3,
  cursor: "pointer",
  textAlign: "center",
  textTransform: "uppercase",
  transition: "background 0.15s ease",
};

/* ── Modal Styles ──────────────────────────────────────────────────── */

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(8, 25, 48, 0.6)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 300,
  padding: 24,
};

const modalContent: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 8,
  width: "100%",
  maxWidth: 680,
  boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const modalHeader: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid #dce7f2",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  background: "#f7fafc",
};

const modalTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  color: "#122a44",
};

const modalSub: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#617387",
};

const modalCloseBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  lineHeight: 1,
  color: "#8395a8",
  cursor: "pointer",
  padding: 0,
};

const examplesGrid: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  maxHeight: 460,
  overflowY: "auto",
};

const exampleCard: React.CSSProperties = {
  background: "#f9fbfd",
  border: "1px solid #d6e3ef",
  borderRadius: 6,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const exampleCardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const exampleCardTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#163454",
};

const exampleBadge: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  background: "#e1eef9",
  color: "#1971a8",
  padding: "2px 8px",
  borderRadius: 4,
};

const exampleDesc: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#53677b",
  lineHeight: 1.4,
};

const exampleCardFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 4,
};

const examplePartsCount: React.CSSProperties = {
  fontSize: 12,
  color: "#7e92a5",
};

const loadExampleBtn: React.CSSProperties = {
  background: "#1e88e5",
  color: "#ffffff",
  border: "none",
  borderRadius: 4,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
