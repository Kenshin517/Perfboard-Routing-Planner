"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createBoard, BoardEngine } from "@/engine/BoardEngine";
import { refPrefixFor } from "@/engine/footprints";
import type { HoleCoord } from "@/engine/types";
import PerfboardCanvas from "@/components/PerfboardCanvas";
import { saveProject, loadProject, downloadProject, readProjectFile } from "@/storage/projectStorage";
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
  if (!engineRef.current) engineRef.current = createBoard({ cols: 25, rows: 29, mounting: "corners" }); // A..Y x 1..29 real board + corner mounting holes
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

  // Load autosaved project on mount.
  useEffect(() => {
    let cancelled = false;
    loadProject().then((data) => {
      if (cancelled) return;
      if (data) {
        try {
          swapEngine(BoardEngine.fromSerialized(data));
        } catch {
          /* ignore corrupt autosave */
        }
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: load the autosaved project exactly once. The
    // helpers it calls (swapEngine/loadProject) are stable for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (debounced) after any change, once initial load is done.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void saveProject(engine.serialize());
    }, 400);
    return () => clearTimeout(t);
  }, [rev, loaded, engine]);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      swapEngine(BoardEngine.fromSerialized(await readProjectFile(file)));
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
      pushHistory();
      const res = engine.loadNetlist(parsed);
      setResetToken((t) => t + 1);
      bump();
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

  return (
    <main style={{ display: "flex", height: "100%" }}>
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* status */}
            <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 2 }}>
              {airwires.length}✈ · {counts.jumpers}⤴ ·{" "}
              <span style={{ color: counts.bottomCrossings ? "#ff5a5a" : "var(--muted)", fontWeight: counts.bottomCrossings ? 600 : 400 }}>
                {counts.bottomCrossings}✕
              </span>
            </span>

            {/* context: routing / placing */}
            {placingId && (
              <span style={{ fontSize: 12, color: "var(--accent)" }}>Taruh {engine.getComponent(placingId)?.ref}… Esc</span>
            )}
            {routing && drawPath.length > 0 && (
              <>
                <span style={{ fontSize: 12, color: palette.routeStart }}>{routeNet ? routeNet : "no net"} · {drawPath.length}</span>
                <button onClick={finishFreeDraw} style={{ ...btn, borderColor: palette.routeStart, color: palette.routeStart }} title="Selesai (Enter)">Finish</button>
                <button onClick={() => setDrawPath([])} style={btn} title="Batal (Esc)">✕</button>
              </>
            )}

            <Sep />
            {/* Routing group */}
            <Grp label="Route">
              <button onClick={toggleRouting} style={{ ...btn, ...(routing ? activeBtn : {}) }} title="Routing: klik lubang demi lubang; Enter/double-click selesai">✎ Route</button>
              <button onClick={() => { mutate(() => engine.autoroute()); setSelectedTrace(null); }} style={{ ...btn, ...(airwires.length ? activeBtn : {}) }} title="Autoroute semua koneksi tersisa">⚡ Auto</button>
              {counts.traces > 0 && <button onClick={() => { mutate(() => engine.clearTraces()); setSelectedTrace(null); }} style={btn} title="Hapus semua jalur">Clear</button>}
              {counts.bottomCrossings > 0 && <button onClick={() => mutate(() => engine.promoteCrossingsToJumper())} style={{ ...btn, borderColor: "#ff5a5a", color: "#ff8f8f" }} title="Ubah crossing jadi jumper">Fix ✕</button>}
            </Grp>

            <Sep />
            {/* View group */}
            <Grp label="View">
              <button onClick={doFlip} style={{ ...btn, ...(flipped ? activeBtn : {}) }} title="Balik sisi atas/bawah (F)">⇄ {flipped ? "Bottom" : "Top"}</button>
              <button onClick={() => setMode3d((v) => !v)} style={{ ...btn, ...(mode3d ? activeBtn : {}) }} title="Toggle 2D / 3D">{mode3d ? "3D" : "2D"}</button>
              <button onClick={() => setResetToken((t) => t + 1)} style={btn} title="Reset zoom/pan">⤢</button>
            </Grp>

            <Sep />
            {/* Board size */}
            <Grp label="Board">
              <input type="number" min={1} max={120} value={cols} title="Kolom"
                onChange={(e) => { const v = clamp(Number(e.target.value)); setCols(v); applySize(v, rows); }} style={input} />
              <span style={{ color: "var(--muted)" }}>×</span>
              <input type="number" min={1} max={120} value={rows} title="Baris"
                onChange={(e) => { const v = clamp(Number(e.target.value)); setRows(v); applySize(cols, v); }} style={input} />
            </Grp>

            <Sep />
            {/* Edit group */}
            <Grp label="Edit">
              <button onClick={undo} disabled={history.current.past.length === 0} style={{ ...btn, opacity: history.current.past.length ? 1 : 0.4 }} title="Undo (Ctrl+Z)">↶</button>
              <button onClick={redo} disabled={history.current.future.length === 0} style={{ ...btn, opacity: history.current.future.length ? 1 : 0.4 }} title="Redo (Ctrl+Y)">↷</button>
            </Grp>

            <Sep />
            {/* Output group */}
            <Grp label="Output">
              <button onClick={() => setShowBuildList((s) => !s)} style={{ ...btn, ...(showBuildList ? activeBtn : {}) }} title="Build-list (resep rakit)">☰ List</button>
              <button onClick={() => { void exportPdf(engine); }} style={btn} title="Export PDF 1:1">PDF</button>
              <button onClick={() => exportPng(engine, { flipped })} style={btn} title="Export PNG preview">PNG</button>
            </Grp>

            <Sep />
            {/* File group */}
            <Grp label="File">
              <button onClick={() => netlistRef.current?.click()} style={btn} title="Import netlist KiCad (.net / .xml)">Netlist</button>
              <button onClick={() => downloadProject(engine.serialize())} style={btn} title="Export project (.json)">⭳</button>
              <button onClick={() => fileRef.current?.click()} style={btn} title="Import project (.json)">⭱</button>
            </Grp>
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

        {(selComp || selTrace) && (
          <PropertiesPanel
            component={selComp ?? undefined}
            footprintPins={selComp ? engine.getFootprint(selComp.footprint)?.pins.length ?? 0 : 0}
            trace={selTrace}
            onRef={(v) => mutate(() => engine.setComponentRef(selComp!.id, v))}
            onValue={(v) => mutate(() => engine.setComponentValue(selComp!.id, v))}
            onRotation={(r) => mutate(() => engine.rotateComponent(selComp!.id, r))}
            onDeleteComp={() => { mutate(() => engine.removeComponent(selComp!.id)); setSelected(null); }}
            onTraceLayer={(l) => mutate(() => engine.setTraceLayer(selTrace!.id, l))}
            onDeleteTrace={() => { mutate(() => engine.removeTrace(selTrace!.id)); setSelectedTrace(null); }}
            onClose={() => { setSelected(null); setSelectedTrace(null); }}
          />
        )}

        <footer style={footerStyle}>
          {routing
            ? "Route: klik lubang demi lubang (jalur ngikut grid) · Enter / double-click = selesai · Esc = batal"
            : "Pilih part di kiri → klik board untuk taruh · klik part untuk pilih/geser · R rotate, Del hapus · Ctrl+Z/Y undo · scroll zoom, drag pan"}
        </footer>
      </section>
    </main>
  );
}

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
import type { PlacedComponent, Trace, Rotation, Layer } from "@/engine/types";

/** EasyEDA-style right-side properties panel for the selected component or trace. */
function PropertiesPanel(props: {
  component?: PlacedComponent;
  footprintPins: number;
  trace?: Trace;
  onRef: (v: string) => void;
  onValue: (v: string) => void;
  onRotation: (r: Rotation) => void;
  onDeleteComp: () => void;
  onTraceLayer: (l: Layer) => void;
  onDeleteTrace: () => void;
  onClose: () => void;
}) {
  const c = props.component;
  const t = props.trace;
  return (
    <div style={propPanelStyle}>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 13 }}>{c ? "Component" : "Trace"}</strong>
        <button onClick={props.onClose} style={{ ...btn, marginLeft: "auto" }}>✕</button>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {c && (
          <>
            <Field label="Ref">
              <input value={c.ref} onChange={(e) => props.onRef(e.target.value)} style={propInput} />
            </Field>
            <Field label="Value">
              <input value={c.value ?? ""} onChange={(e) => props.onValue(e.target.value)} placeholder="—" style={propInput} />
            </Field>
            <Field label="Footprint">
              <span style={propReadonly}>{c.footprint} · {props.footprintPins} pin</span>
            </Field>
            <Field label="Rotation">
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 90, 180, 270].map((r) => (
                  <button key={r} onClick={() => props.onRotation(r as Rotation)}
                    style={{ ...btn, ...(c.rotation === r ? activeBtn : {}), flex: 1 }}>{r}°</button>
                ))}
              </div>
            </Field>
            <Field label="Anchor">
              <span style={propReadonly}>{coordLabel(c.anchor.col, c.anchor.row)}</span>
            </Field>
            <button onClick={props.onDeleteComp} style={{ ...btn, borderColor: "#ff5a5a", color: "#ff8f8f" }}>Delete component</button>
          </>
        )}
        {t && !c && (
          <>
            <Field label="Net"><span style={propReadonly}>{t.net ?? "(no net)"}</span></Field>
            <Field label="Holes"><span style={propReadonly}>{t.path.length}</span></Field>
            <Field label="Layer">
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => props.onTraceLayer("bottom-copper")} style={{ ...btn, ...(t.layer === "bottom-copper" ? activeBtn : {}), flex: 1 }}>bottom</button>
                <button onClick={() => props.onTraceLayer("jumper")} style={{ ...btn, ...(t.layer === "jumper" ? activeBtn : {}), flex: 1 }}>jumper</button>
              </div>
            </Field>
            <button onClick={props.onDeleteTrace} style={{ ...btn, borderColor: "#ff5a5a", color: "#ff8f8f" }}>Delete trace</button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      {children}
    </label>
  );
}

function coordLabel(col: number, row: number): string {
  // tiny local helper to avoid importing engine internals into the panel
  let s = "", n = col + 1;
  while (n > 0) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); }
  return s + (row + 1);
}

/** A labelled toolbar group with its own subtle caption, EasyEDA-style. */
function Grp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{children}</div>
      <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 30, background: "var(--border)", margin: "0 2px" }} />;
}

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

const propPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: 240,
  background: "var(--panel)",
  borderLeft: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "-8px 0 24px rgba(0,0,0,0.3)",
  zIndex: 4,
};
const propInput: React.CSSProperties = {
  padding: "6px 8px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: 13,
};
const propReadonly: React.CSSProperties = { fontSize: 13, color: "var(--text)", fontFamily: "ui-monospace, Menlo, monospace" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
const input: React.CSSProperties = { width: 56, padding: "4px 6px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6 };
const btn: React.CSSProperties = { padding: "5px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" };
const activeBtn: React.CSSProperties = { borderColor: "var(--accent)", color: "var(--accent)" };
