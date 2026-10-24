"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createBoard, BoardEngine, type SerializedProject } from "@/engine/BoardEngine";
import { refPrefixFor } from "@/engine/footprints";
import type { HoleCoord } from "@/engine/types";
import PerfboardCanvas from "@/components/PerfboardCanvas";
import BoardSizeSelector from "@/components/BoardSizeSelector";
import HomeDashboard from "@/components/HomeDashboard";
import ProjectTree, { type ActiveTab } from "@/components/ProjectTree";
import SchematicEditor from "@/components/SchematicEditor";
import { saveProject, loadProject, downloadProject, readProjectFile, addRecentProject } from "@/storage/projectStorage";
import { parseNetlist } from "@/engine/netlist";
import { exportPdf } from "@/export/pdf";
import { exportPng } from "@/export/png";
import { palette } from "@/lib/theme";

const Perfboard3D = dynamic(() => import("@/components/Perfboard3D"), { ssr: false });

function nextRef(engine: BoardEngine, prefix: string): string {
  let max = 0;
  for (const c of engine.getComponents()) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(c.ref);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${max + 1}`;
}

export default function Home() {
  const engineRef = useRef<BoardEngine>();
  /** "dashboard" (STM32CubeMX style), "board-selector", or "editor" */
  const [view, setView] = useState<"dashboard" | "board-selector" | "editor">("dashboard");
  const [hasActiveProject, setHasActiveProject] = useState<boolean>(false);
  const [editorTab, setEditorTab] = useState<ActiveTab>("schematic");
  const [treeCollapsed, setTreeCollapsed] = useState<boolean>(false);
  const [currentProjectName, setCurrentProjectName] = useState<string>("main q22");

  const initEngine = (c: number, r: number) => {
    engineRef.current = createBoard({ cols: c, rows: r });
    setCols(c);
    setRows(r);
    setHasActiveProject(true);
    setView("editor");
    setEditorTab("pcb");
    setLoaded(true);
    addRecentProject(`Board_${c}x${r}.pbrp`, engineRef.current.serialize());
  };

  const handleLoadProject = (data: SerializedProject, name?: string) => {
    try {
      swapEngine(BoardEngine.fromSerialized(data));
      setHasActiveProject(true);
      setView("editor");
      setEditorTab("schematic");
      setLoaded(true);
      if (name) {
        setCurrentProjectName(name.replace(/\.[^/.]+$/, ""));
        addRecentProject(name, data);
      }
    } catch {
      alert("Project tidak dapat dibuka.");
    }
  };

  // Provide a fallback engine so hooks below never see undefined.
  if (!engineRef.current) engineRef.current = createBoard({ cols: 1, rows: 1 });
  const engine = engineRef.current;

  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);

  const [cols, setCols] = useState(engine.cols);
  const [rows, setRows] = useState(engine.rows);
  const [resetToken, setResetToken] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [hoverHole, setHoverHole] = useState<HoleCoord | null>(null);
  const [drawPath, setDrawPath] = useState<HoleCoord[]>([]);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [flipScale, setFlipScale] = useState(1);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [showBuildList, setShowBuildList] = useState(false);
  const [mode3d, setMode3d] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const netlistRef = useRef<HTMLInputElement>(null);

  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const snapshot = () => JSON.stringify(engine.serialize());

  const clearTransient = () => {
    setSelected(null);
    setSelectedTrace(null);
    setPlacingId(null);
    setHoverHole(null);
    setDrawPath([]);
  };

  const swapEngine = (next: BoardEngine, resetHistory = true) => {
    engineRef.current = next;
    if (resetHistory) history.current = { past: [], future: [] };
    setCols(next.cols);
    setRows(next.rows);
    setArmed(null);
    clearTransient();
    bump();
  };

  // Snapshot current state, then run a mutation (so it can be undone).
  const pushHistory = () => {
    history.current.past.push(snapshot());
    if (history.current.past.length > 80) history.current.past.shift();
    history.current.future = [];
  };
  const mutate = (fn: () => void) => {
    pushHistory();
    fn();
    bump();
  };
  const undo = () => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(snapshot());
    engineRef.current = BoardEngine.fromSerialized(JSON.parse(h.past.pop()!));
    setCols(engineRef.current.cols);
    setRows(engineRef.current.rows);
    clearTransient();
    bump();
  };
  const redo = () => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(snapshot());
    engineRef.current = BoardEngine.fromSerialized(JSON.parse(h.future.pop()!));
    setCols(engineRef.current.cols);
    setRows(engineRef.current.rows);
    clearTransient();
    bump();
  };

  // Load autosaved project on mount (stays on dashboard, marks active project available).
  useEffect(() => {
    let cancelled = false;
    loadProject().then((data) => {
      if (cancelled) return;
      if (data) {
        try {
          swapEngine(BoardEngine.fromSerialized(data));
          setHasActiveProject(true);
        } catch {
          /* ignore corrupt autosave */
        }
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (debounced) after any change, once initial load is done.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const snap = engine.serialize();
      void saveProject(snap);
      addRecentProject("Current_Project.pbrp", snap);
    }, 400);
    return () => clearTimeout(t);
  }, [rev, loaded, engine]);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await readProjectFile(file);
      swapEngine(BoardEngine.fromSerialized(data));
      setHasActiveProject(true);
      setView("editor");
      setLoaded(true);
      addRecentProject(file.name, data);
    } catch {
      alert("File project tidak valid.");
    }
  };

  const onImportNetlist = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = parseNetlist(await file.text());
      if (!hasActiveProject || engine.cols === 1) {
        engineRef.current = createBoard({ cols: 27, rows: 35 });
        setCols(27);
        setRows(35);
      }
      pushHistory();
      const res = engine.loadNetlist(parsed);
      setHasActiveProject(true);
      setView("editor");
      setLoaded(true);
      setResetToken((t) => t + 1);
      bump();
      const filename = file.name.replace(/\.[^/.]+$/, "") + ".pbrp";
      addRecentProject(filename, engine.serialize());
      const note = `${res.added} komponen masuk ke tray "Unplaced" — klik tiap part lalu taruh di board.`;
      alert(res.generic.length ? `${note}\nFootprint generic (belum dikenal): ${res.generic.join(", ")}.` : note);
    } catch {
      alert("Netlist tidak kebaca. Export dari KiCad: Eeschema → Export Netlist (.net), atau XML netlist. File lain belum didukung.");
    }
  };

  const toggleRouting = () => {
    setRouting((r) => {
      const next = !r;
      if (next) {
        setArmed(null);
        setPlacingId(null);
      }
      setHoverHole(null);
      setDrawPath([]);
      setSelected(null);
      return next;
    });
  };

  // Routing is always free-draw: each click adds a waypoint.
  const onRoutePick = (hole: HoleCoord) => {
    freeDrawPick(hole);
  };

  // Free-draw: append a clicked hole (blocking foreign pads), finish on Enter/double-click.
  const freeDrawPick = (hole: HoleCoord) => {
    const startNet = drawPath.length ? engine.netAt(drawPath[0]) : engine.netAt(hole);
    const hn = engine.netAt(hole);
    if (drawPath.length && hn && hn !== startNet) return; // can't pass through a foreign pad
    setDrawPath((p) => [...p, hole]);
  };
  const finishFreeDraw = () => {
    const r = drawPath.length >= 2 ? engine.routeWaypoints(drawPath) : null;
    if (!r || r.path.length < 2) {
      if (drawPath.length >= 2) alert("Gak bisa nyambungin titik-titik itu lewat grid (kehalang).");
      setDrawPath([]);
      return;
    }
    mutate(() => engine.addTrace(r.path, { layer: "bottom-copper", net: r.net }));
    setDrawPath([]);
  };

  const placeExisting = (id: string, hole: HoleCoord) => {
    mutate(() => engine.place(id, hole));
    setPlacingId(null);
  };

  // Flip with a quick "card flip" squish so the board visibly turns over.
  const doFlip = () => {
    setFlipScale(0);
    window.setTimeout(() => {
      setFlipped((f) => !f);
      setFlipScale(1);
    }, 170);
  };

  const clamp = (n: number) => Math.max(1, Math.min(120, Math.round(n || 1)));
  // Free-draw: the grid path stitched through clicked waypoints (+ hover).
  const freePoints = hoverHole ? [...drawPath, hoverHole] : drawPath;
  const freeStitched =
    routing && freePoints.length >= 2 ? engine.routeWaypoints(freePoints)?.path ?? null : null;
  // Net being routed (from the first waypoint) + its destination pads, so the
  // user can see where the current wire should connect — like KiCad's ratsnest.
  const routeNet = routing && drawPath.length > 0 ? engine.netAt(drawPath[0]) ?? null : null;
  const routeTargets = routeNet ? engine.padsOfNet(routeNet) : [];
  const unplaced = engine.getUnplacedComponents();
  const airwires = engine.ratsnest();
  const crossPairs = engine.crossings();
  const crossingIds = Array.from(new Set(crossPairs.flatMap((p) => [p.a, p.b])));
  const counts = engine.counts();
  const selTrace = selectedTrace ? engine.getTraces().find((t) => t.id === selectedTrace) : undefined;
  const applySize = (c: number, r: number) => {
    mutate(() => engine.resize(c, r));
  };

  // Keyboard shortcuts. The handler is kept in a ref (latest-ref pattern) so it
  // always sees fresh state without re-subscribing or stale closures.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod) return; // leave other ctrl/cmd combos to the browser
    if (k === "enter") {
      if (routing && drawPath.length >= 2) finishFreeDraw();
    } else if (k === "escape") {
      setArmed(null);
      setSelectedTrace(null);
      clearTransient();
    } else if ((k === "delete" || k === "backspace") && selectedTrace) {
      mutate(() => engine.removeTrace(selectedTrace));
      setSelectedTrace(null);
    } else if (k === "r" && selected) {
      mutate(() => engine.rotateBy90(selected));
    } else if ((k === "delete" || k === "backspace") && selected) {
      mutate(() => engine.removeComponent(selected));
      setSelected(null);
    } else if (k === "f") {
      doFlip();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const place = (fp: string, hole: HoleCoord) => {
    mutate(() => engine.addComponent({ footprint: fp, ref: nextRef(engine, refPrefixFor(fp)), anchor: hole }));
  };

  const selComp = selected ? engine.getComponent(selected) : undefined;

  // 1. Dashboard (STM32CubeMX Style)
  if (view === "dashboard") {
    return (
      <HomeDashboard
        onSelectBoard={() => setView("board-selector")}
        onLoadProject={handleLoadProject}
        onImportFile={onImportFile}
        onImportNetlist={onImportNetlist}
        hasActiveProject={hasActiveProject}
        onResumeActive={() => setView("editor")}
      />
    );
  }

  // 2. Board Size Selector
  if (view === "board-selector") {
    return (
      <BoardSizeSelector
        onSelect={(c, r) => initEngine(c, r)}
        onBack={() => setView("dashboard")}
      />
    );
  }

  // 3. Main Editor (Schematic1 + PCB1 Tabs)
  return (
    <main style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      {/* Top EDA Tabs Bar */}
      <div style={editorTopBar}>
        <button
          onClick={() => setView("dashboard")}
          style={homeNavBtn}
          title="Kembali ke Dashboard / Menu Utama"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          Home
        </button>

        <div style={topTabSeparator} />

        {/* Tab 1: Schematic1 (1. P1) */}
        <button
          onClick={() => setEditorTab("schematic")}
          style={{
            ...edaTab,
            ...(editorTab === "schematic" ? edaTabActive : {}),
          }}
        >
          <span style={{ fontSize: 13 }}>📄</span>
          <span>Schematic1 (1. P1)</span>
        </button>

        {/* Tab 2: PCB1 (Perfboard Bolong) */}
        <button
          onClick={() => setEditorTab("pcb")}
          style={{
            ...edaTab,
            ...(editorTab === "pcb" ? edaTabActive : {}),
          }}
        >
          <span style={{ fontSize: 13 }}>🟩</span>
          <span>PCB1 ({engine.cols}×{engine.rows} Perfboard)</span>
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, paddingRight: 16 }}>
          <span style={{ fontSize: 12, color: "#8b98a5" }}>
            Project: <strong style={{ color: "#e6edf3" }}>{currentProjectName}</strong>
          </span>
        </div>
      </div>

      {/* Editor Body: Left Project Tree + Active View (Schematic or PCB) */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {/* Left Project Tree (Image 1) */}
        <ProjectTree
          projectName={currentProjectName}
          activeTab={editorTab}
          onSelectTab={setEditorTab}
          collapsed={treeCollapsed}
          onToggleCollapse={() => setTreeCollapsed((v) => !v)}
        />

        {/* View 1: Schematic Editor (Image 2) */}
        {editorTab === "schematic" && (
          <SchematicEditor
            engine={engine}
            projectName={currentProjectName}
            onSyncToBoard={() => {
              bump();
              alert("Komponen & Netlist berhasil disinkronkan ke Perfboard (PCB1)!");
            }}
            onOpenPcb={() => setEditorTab("pcb")}
          />
        )}

        {/* View 2: PCB1 (Perfboard Bolong) */}
        {editorTab === "pcb" && (
          <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
            {/* Palette */}
            <aside style={paletteStyle}>
        {unplaced.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>
              Unplaced ({unplaced.length})
            </div>
            {unplaced.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setArmed(null);
                  setRouting(false);
                  setDrawPath([]);
                  setPlacingId((p) => (p === c.id ? null : c.id));
                }}
                style={{ ...paletteBtn, ...(placingId === c.id ? paletteBtnActive : {}) }}
                title={c.footprint}
              >
                {c.ref} &middot; {c.footprint}
              </button>
            ))}
            <div style={{ height: 12 }} />
          </>
        )}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Components</div>
        {engine.listFootprints().filter((fp) => !fp.name.startsWith("GEN_")).map((fp) => (
          <button
            key={fp.name}
            onClick={() => { setArmed((a) => (a === fp.name ? null : fp.name)); setPlacingId(null); }}
            style={{ ...paletteBtn, ...(armed === fp.name ? paletteBtnActive : {}) }}
          >
            {fp.name}
          </button>
        ))}
        {armed && (
          <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>
            Klik board untuk taruh {armed}. Esc = stop.
          </div>
        )}
      </aside>

      {/* Canvas + chrome */}
      <section style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, position: "relative" }}>
        <header style={headerStyle}>
          <strong style={{ fontSize: 15 }}>Perfboard Routing Planner</strong>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            {engine.cols} × {engine.rows} &middot; {engine.getComponents().length} parts
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {airwires.length} airwire{airwires.length === 1 ? "" : "s"} &middot; {counts.jumpers} jumper{counts.jumpers === 1 ? "" : "s"} &middot;{" "}
              <span style={{ color: counts.bottomCrossings ? "#ff5a5a" : "var(--muted)", fontWeight: counts.bottomCrossings ? 600 : 400 }}>
                {counts.bottomCrossings} crossing{counts.bottomCrossings === 1 ? "" : "s"}
              </span>
            </span>
            <button onClick={() => { mutate(() => engine.autoroute()); setSelectedTrace(null); }} style={{ ...btn, ...(airwires.length ? activeBtn : {}) }}>
              Autoroute
            </button>
            {counts.traces > 0 && (
              <button onClick={() => { mutate(() => engine.clearTraces()); setSelectedTrace(null); }} style={btn}>Clear routing</button>
            )}
            {counts.bottomCrossings > 0 && (
              <button onClick={() => mutate(() => engine.promoteCrossingsToJumper())} style={{ ...btn, borderColor: "#ff5a5a", color: "#ff8f8f" }}>
                Jumper-kan crossings
              </button>
            )}
            {placingId && (
              <span style={{ fontSize: 13, color: "var(--accent)" }}>
                Taruh {engine.getComponent(placingId)?.ref} di board… Esc batal
              </span>
            )}
            <button onClick={toggleRouting} style={{ ...btn, ...(routing ? activeBtn : {}) }} title="Klik lubang demi lubang; Enter / double-click = selesai">
              {routing ? "Routing…" : "Route"}
            </button>
            {routing && drawPath.length > 0 && (
              <>
                <span style={{ fontSize: 13, color: palette.routeStart }}>
                  {routeNet ? `net ${routeNet}` : "(no net)"} · {drawPath.length} holes
                </span>
                <button onClick={finishFreeDraw} style={{ ...btn, borderColor: palette.routeStart, color: palette.routeStart }}>Finish (Enter)</button>
                <button onClick={() => setDrawPath([])} style={btn}>Cancel (Esc)</button>
              </>
            )}
            <button onClick={doFlip} style={{ ...btn, ...(flipped ? activeBtn : {}) }}>
              {flipped ? "Bottom view" : "Top view"}
            </button>
            <button onClick={() => setMode3d((v) => !v)} style={{ ...btn, ...(mode3d ? activeBtn : {}) }}>
              {mode3d ? "3D" : "2D"}
            </button>
            <span style={{ width: 1, height: 20, background: "var(--border)" }} />
            {selTrace && (
              <>
                <span style={{ fontSize: 13, color: "var(--accent)" }}>
                  trace {selTrace.net ?? "(no net)"} / {selTrace.layer}
                </span>
                <button onClick={() => mutate(() => engine.setTraceLayer(selTrace.id, selTrace.layer === "jumper" ? "bottom-copper" : "jumper"))} style={btn}>
                  {selTrace.layer === "jumper" ? "→ bottom" : "→ jumper"}
                </button>
                <button onClick={() => { mutate(() => engine.removeTrace(selTrace.id)); setSelectedTrace(null); }} style={btn}>Delete trace</button>
                <span style={{ width: 1, height: 20, background: "var(--border)" }} />
              </>
            )}
            {selComp && (
              <>
                <span style={{ fontSize: 13, color: "var(--accent)" }}>
                  {selComp.ref} ({selComp.footprint}) {selComp.rotation}&deg;
                </span>
                <button onClick={() => mutate(() => engine.rotateBy90(selComp.id))} style={btn}>Rotate (R)</button>
                <button onClick={() => { mutate(() => engine.removeComponent(selComp.id)); setSelected(null); }} style={btn}>Delete</button>
                <span style={{ width: 1, height: 20, background: "var(--border)" }} />
              </>
            )}
            <label style={lbl}>
              Cols{" "}
              <input type="number" min={1} max={120} value={cols}
                onChange={(e) => { const v = clamp(Number(e.target.value)); setCols(v); applySize(v, rows); }}
                style={input} />
            </label>
            <label style={lbl}>
              Rows{" "}
              <input type="number" min={1} max={120} value={rows}
                onChange={(e) => { const v = clamp(Number(e.target.value)); setRows(v); applySize(cols, v); }}
                style={input} />
            </label>
            <button onClick={undo} disabled={history.current.past.length === 0} style={{ ...btn, opacity: history.current.past.length ? 1 : 0.4 }} title="Undo (Ctrl+Z)">↶</button>
            <button onClick={redo} disabled={history.current.future.length === 0} style={{ ...btn, opacity: history.current.future.length ? 1 : 0.4 }} title="Redo (Ctrl+Y)">↷</button>
            <button onClick={() => setShowBuildList((s) => !s)} style={{ ...btn, ...(showBuildList ? activeBtn : {}) }}>Build list</button>
            <button onClick={() => { void exportPdf(engine); }} style={btn}>PDF</button>
            <button onClick={() => exportPng(engine, { flipped })} style={btn}>PNG</button>
            <button onClick={() => setResetToken((t) => t + 1)} style={btn}>Reset view</button>
            <span style={{ width: 1, height: 20, background: "var(--border)" }} />
            <button onClick={() => netlistRef.current?.click()} style={btn}>Import netlist</button>
            <button onClick={() => downloadProject(engine.serialize())} style={btn}>Export</button>
            <button onClick={() => fileRef.current?.click()} style={btn}>Import</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
            <input ref={netlistRef} type="file" accept=".net,.xml,.txt" onChange={onImportNetlist} style={{ display: "none" }} />
          </div>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            transform: mode3d ? undefined : `scaleX(${flipScale})`,
            transition: "transform 0.17s ease-in-out",
          }}
        >
          {mode3d ? (
            <Perfboard3D engine={engine} rev={rev} />
          ) : (
          <PerfboardCanvas
            engine={engine}
            rev={rev}
            resetToken={resetToken}
            armedFootprint={armed}
            selectedId={selected}
            airwires={airwires}
            flipped={flipped}
            routing={routing}
            crossingIds={crossingIds}
            selectedTraceId={selectedTrace}
            placingComponentId={placingId}
            onRoutePick={onRoutePick}
            onHover={setHoverHole}
            onPlaceComponent={placeExisting}
            onSelectTrace={setSelectedTrace}
            onSelect={setSelected}
            onPlace={place}
            drawPath={freeStitched}
            drawWaypoints={drawPath}
            routeNet={routeNet}
            routeTargets={routeTargets}
            onRouteFinish={finishFreeDraw}
            onMoveStart={pushHistory}
            onMove={(id, anchor) => { engine.moveComponent(id, anchor); bump(); }}
          />
          )}
        </div>

        {showBuildList && <BuildListPanel text={engine.buildList()} onClose={() => setShowBuildList(false)} />}

        <footer style={footerStyle}>
          {routing
            ? "Route: klik lubang demi lubang (jalur ngikut grid) · Enter / double-click = selesai · Esc = batal"
            : "Pilih part di kiri → klik board untuk taruh · klik part untuk pilih/geser · R rotate, Del hapus · Ctrl+Z/Y undo · scroll zoom, drag pan"}
        </footer>
      </section>
    </div>
  )}
</div>
</main>
  );
}

const editorTopBar: React.CSSProperties = {
  height: 38,
  background: "#181d24",
  borderBottom: "1px solid #2a323c",
  display: "flex",
  alignItems: "center",
  padding: "0 10px",
  gap: 6,
  userSelect: "none",
  flexShrink: 0,
};

const homeNavBtn: React.CSSProperties = {
  background: "#082142",
  border: "1px solid #289ee0",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 4,
  cursor: "pointer",
};

const topTabSeparator: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "#2a323c",
  margin: "0 6px",
};

const edaTab: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "#8b98a5",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  height: 38,
  transition: "all 0.15s ease",
};

const edaTabActive: React.CSSProperties = {
  color: "#ffffff",
  borderBottom: "2px solid #289ee0",
  background: "#1e2630",
  fontWeight: 600,
};

const paletteStyle: React.CSSProperties = {
  width: 190,
  padding: 12,
  background: "var(--panel)",
  borderRight: "1px solid var(--border)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const paletteBtn: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 9px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
const paletteBtnActive: React.CSSProperties = { borderColor: "var(--accent)", color: "var(--accent)" };
const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "10px 16px",
  background: "var(--panel)",
  borderBottom: "1px solid var(--border)",
};
const footerStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 12,
  color: "var(--muted)",
  background: "var(--panel)",
  borderTop: "1px solid var(--border)",
};
function BuildListPanel({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: "var(--panel)",
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 14 }}>Build list</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigator.clipboard?.writeText(text)} style={btn}>Copy</button>
          <button onClick={onClose} style={btn}>Close</button>
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          overflow: "auto",
          flex: 1,
          fontSize: 12.5,
          lineHeight: 1.5,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
const input: React.CSSProperties = { width: 56, padding: "4px 6px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6 };
const btn: React.CSSProperties = { padding: "5px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" };
const activeBtn: React.CSSProperties = { borderColor: "var(--accent)", color: "var(--accent)" };
