"use client";

import { useEffect, useRef, useState } from "react";
import { createBoard, BoardEngine } from "@/engine/BoardEngine";
import type { HoleCoord } from "@/engine/types";
import PerfboardCanvas from "@/components/PerfboardCanvas";
import { saveProject, loadProject, downloadProject, readProjectFile } from "@/storage/projectStorage";
import { parseKicadXmlNetlist } from "@/engine/netlist";

function prefixFor(fp: string): string {
  if (fp.startsWith("DIP")) return "U";
  if (fp.startsWith("R_")) return "R";
  if (fp.startsWith("C_")) return "C";
  if (fp.startsWith("DIODE")) return "D";
  if (fp.startsWith("PINHDR") || fp.startsWith("SCREW")) return "J";
  if (fp.startsWith("TO-220")) return "Q";
  if (fp.startsWith("ESP32")) return "U";
  return "X";
}

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
  if (!engineRef.current) engineRef.current = createBoard({ cols: 24, rows: 20 });
  const engine = engineRef.current;

  const [rev, setRev] = useState(0);
  const bump = () => setRev((r) => r + 1);

  const [cols, setCols] = useState(engine.cols);
  const [rows, setRows] = useState(engine.rows);
  const [resetToken, setResetToken] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeStart, setRouteStart] = useState<HoleCoord | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const netlistRef = useRef<HTMLInputElement>(null);

  const swapEngine = (next: BoardEngine) => {
    engineRef.current = next;
    setCols(next.cols);
    setRows(next.rows);
    setSelected(null);
    setArmed(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave (debounced) after any change, once initial load is done.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      void saveProject(engine.serialize());
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, loaded]);

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
      const parsed = parseKicadXmlNetlist(await file.text());
      const res = engine.loadNetlist(parsed);
      setResetToken((t) => t + 1);
      bump();
      if (res.generic.length) {
        alert(`Imported ${res.added} komponen. Footprint generic (belum dikenal): ${res.generic.join(", ")} — atur manual kalau perlu.`);
      }
    } catch {
      alert("Netlist tidak valid. Export dari KiCad sebagai XML netlist ya.");
    }
  };

  const toggleRouting = () => {
    setRouting((r) => {
      const next = !r;
      if (next) setArmed(null);
      setRouteStart(null);
      setSelected(null);
      return next;
    });
  };

  const onRoutePick = (hole: HoleCoord) => {
    if (!routeStart) {
      setRouteStart(hole);
      return;
    }
    const id = engine.routePadToPad(routeStart, hole);
    setRouteStart(null);
    if (!id) alert("Gak nemu jalur antara dua titik itu.");
    else bump();
  };

  const clamp = (n: number) => Math.max(1, Math.min(120, Math.round(n || 1)));
  const airwires = engine.ratsnest();
  const applySize = (c: number, r: number) => {
    engine.resize(c, r);
    bump();
  };

  // Keyboard: R rotate, Delete remove, Esc disarm/deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setArmed(null);
        setSelected(null);
        setRouteStart(null);
      } else if ((e.key === "r" || e.key === "R") && selected) {
        engine.rotateBy90(selected);
        bump();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        engine.removeComponent(selected);
        setSelected(null);
        bump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, engine]);

  const place = (fp: string, hole: HoleCoord) => {
    engine.addComponent({ footprint: fp, ref: nextRef(engine, prefixFor(fp)), anchor: hole });
    bump();
  };

  const selComp = selected ? engine.getComponent(selected) : undefined;

  return (
    <main style={{ display: "flex", height: "100%" }}>
      {/* Palette */}
      <aside style={paletteStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Components</div>
        {engine.listFootprints().map((fp) => (
          <button
            key={fp.name}
            onClick={() => setArmed((a) => (a === fp.name ? null : fp.name))}
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
      <section style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <header style={headerStyle}>
          <strong style={{ fontSize: 15 }}>Perfboard Routing Planner</strong>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            {engine.cols} × {engine.rows} &middot; {engine.getComponents().length} parts
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: airwires.length ? "#8fd79a" : "var(--muted)" }}>
              {airwires.length} airwire{airwires.length === 1 ? "" : "s"}
            </span>
            <button onClick={toggleRouting} style={{ ...btn, ...(routing ? activeBtn : {}) }}>
              {routing ? "Routing…" : "Route"}
            </button>
            <button onClick={() => setFlipped((f) => !f)} style={{ ...btn, ...(flipped ? activeBtn : {}) }}>
              {flipped ? "Bottom view" : "Top view"}
            </button>
            <span style={{ width: 1, height: 20, background: "var(--border)" }} />
            {selComp && (
              <>
                <span style={{ fontSize: 13, color: "var(--accent)" }}>
                  {selComp.ref} ({selComp.footprint}) {selComp.rotation}&deg;
                </span>
                <button onClick={() => { engine.rotateBy90(selComp.id); bump(); }} style={btn}>Rotate (R)</button>
                <button onClick={() => { engine.removeComponent(selComp.id); setSelected(null); bump(); }} style={btn}>Delete</button>
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
            <button onClick={() => setResetToken((t) => t + 1)} style={btn}>Reset view</button>
            <span style={{ width: 1, height: 20, background: "var(--border)" }} />
            <button onClick={() => netlistRef.current?.click()} style={btn}>Import netlist</button>
            <button onClick={() => downloadProject(engine.serialize())} style={btn}>Export</button>
            <button onClick={() => fileRef.current?.click()} style={btn}>Import</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: "none" }} />
            <input ref={netlistRef} type="file" accept=".net,.xml,.txt" onChange={onImportNetlist} style={{ display: "none" }} />
          </div>
        </header>

        <div style={{ flex: 1, minHeight: 0 }}>
          <PerfboardCanvas
            engine={engine}
            rev={rev}
            resetToken={resetToken}
            armedFootprint={armed}
            selectedId={selected}
            airwires={airwires}
            flipped={flipped}
            routing={routing}
            routeStart={routeStart}
            onRoutePick={onRoutePick}
            onSelect={setSelected}
            onPlace={place}
            onMove={(id, anchor) => { engine.moveComponent(id, anchor); bump(); }}
          />
        </div>

        <footer style={footerStyle}>
          Pilih part di kiri &rarr; klik board untuk taruh &middot; klik part untuk pilih/geser &middot; R = rotate, Del = hapus &middot; scroll = zoom, drag = pan
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
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
const input: React.CSSProperties = { width: 56, padding: "4px 6px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6 };
const btn: React.CSSProperties = { padding: "5px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" };
const activeBtn: React.CSSProperties = { borderColor: "var(--accent)", color: "var(--accent)" };
