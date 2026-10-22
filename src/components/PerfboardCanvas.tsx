"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardEngine } from "@/engine/BoardEngine";
import type { Airwire, HoleCoord } from "@/engine/types";
import { colToLabel, rowToLabel } from "@/engine/coordinates";
import { boundsOf, mirrorCol, screenRectFromBounds } from "@/lib/display";
import { palette } from "@/lib/theme";

const CELL_PX = 30;
const MARGIN = 1.2;

/** Distance from point p to segment ab, in the same units as the inputs. */
function pointSegDist(p: { col: number; row: number }, a: HoleCoord, b: HoleCoord): number {
  const dx = b.col - a.col, dy = b.row - a.row;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.col - a.col) * dx + (p.row - a.row) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.col + t * dx, cy = a.row + t * dy;
  return Math.hypot(p.col - cx, p.row - cy);
}

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Props {
  engine: BoardEngine;
  /** Bump to force a redraw after the engine mutates. */
  rev: number;
  /** Changing this re-fits the board to the viewport. */
  resetToken?: number;
  /** If set, the next click places this footprint (anchor at the clicked hole). */
  armedFootprint?: string | null;
  selectedId?: string | null;
  airwires?: Airwire[];
  /** Bottom (solder) view: mirror horizontally. */
  flipped?: boolean;
  /** Routing mode: clicks pick pads instead of placing/selecting. */
  routing?: boolean;
  routeStart?: HoleCoord | null;
  /** Ids of traces currently involved in a crossing (drawn red). */
  crossingIds?: string[];
  selectedTraceId?: string | null;
  /** The proposed route awaiting the user's approval (solid highlight). */
  pendingPath?: HoleCoord[] | null;
  /** Live preview from the picked pad to the hovered hole (dashed). */
  previewPath?: HoleCoord[] | null;
  /** Free-draw path committed so far (solid, with vertices). */
  drawPath?: HoleCoord[] | null;
  /** An unplaced component being dropped: the next click places it. */
  placingComponentId?: string | null;
  onRoutePick?: (hole: HoleCoord) => void;
  onRouteFinish?: () => void;
  onHover?: (hole: HoleCoord) => void;
  onMoveStart?: () => void;
  onPlaceComponent?: (id: string, hole: HoleCoord) => void;
  onSelectTrace?: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
  onPlace?: (footprint: string, hole: HoleCoord) => void;
  onMove?: (id: string, anchor: HoleCoord) => void;
}

interface CompBox {
  id: string;
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

export default function PerfboardCanvas({
  engine,
  rev,
  resetToken = 0,
  armedFootprint = null,
  selectedId = null,
  airwires = [],
  flipped = false,
  routing = false,
  routeStart = null,
  crossingIds = [],
  selectedTraceId = null,
  pendingPath = null,
  previewPath = null,
  drawPath = null,
  placingComponentId = null,
  onRoutePick,
  onRouteFinish,
  onHover,
  onMoveStart,
  onPlaceComponent,
  onSelectTrace,
  onSelect,
  onPlace,
  onMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const compDrag = useRef<{ id: string; dc: number; dr: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { w, h } = size;
    if (w === 0 || h === 0) return;
    const worldW = (engine.cols - 1 + MARGIN * 2) * CELL_PX;
    const worldH = (engine.rows - 1 + MARGIN * 2) * CELL_PX;
    const scale = Math.min(w / worldW, h / worldH) * 0.98;
    setView({
      scale,
      offsetX: (w - (engine.cols - 1) * CELL_PX * scale) / 2,
      offsetY: (h - (engine.rows - 1) * CELL_PX * scale) / 2,
    });
  }, [engine, size]);

  useEffect(() => {
    fit();
  }, [fit, resetToken]);

  // Map screen px -> nearest hole (flip-aware).
  const holeAt = useCallback(
    (px: number, py: number): HoleCoord => {
      const rawCol = Math.round((px - view.offsetX) / (CELL_PX * view.scale));
      const row = Math.round((py - view.offsetY) / (CELL_PX * view.scale));
      return { col: mirrorCol(rawCol, engine.cols, flipped), row };
    },
    [view, flipped, engine],
  );

  // Component bounding boxes (in holes) for hit-testing.
  const boxes = useCallback((): CompBox[] => {
    return engine.getPlacedComponents().map((c) => ({ id: c.id, ...engine.componentBounds(c.id) }));
  }, [engine]);

  // Continuous world coords (flip-aware) for trace hit-testing.
  const worldAt = useCallback(
    (px: number, py: number) => {
      const wc = (px - view.offsetX) / (CELL_PX * view.scale);
      const wr = (py - view.offsetY) / (CELL_PX * view.scale);
      return { col: mirrorCol(wc, engine.cols, flipped), row: wr };
    },
    [view, flipped, engine],
  );

  const traceHitTest = useCallback(
    (world: { col: number; row: number }): string | null => {
      const traces = engine.getTraces();
      for (let i = traces.length - 1; i >= 0; i--) {
        const t = traces[i];
        for (let s = 0; s + 1 < t.path.length; s++) {
          if (pointSegDist(world, t.path[s], t.path[s + 1]) < 0.35) return t.id;
        }
      }
      return null;
    },
    [engine],
  );

  const hitTest = useCallback(
    (hole: HoleCoord): CompBox | null => {
      const bs = boxes();
      // topmost (last added) first
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i];
        if (hole.col >= b.minC - 0.5 && hole.col <= b.maxC + 0.5 && hole.row >= b.minR - 0.5 && hole.row <= b.maxR + 0.5) {
          return b;
        }
      }
      return null;
    },
    [boxes],
  );

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const { scale, offsetX, offsetY } = view;
    const sx = (c: number) => mirrorCol(c, engine.cols, flipped) * CELL_PX * scale + offsetX;
    const sy = (r: number) => r * CELL_PX * scale + offsetY;
    const step = CELL_PX * scale;
    const padR = Math.max(1.5, step * 0.34);
    const holeR = Math.max(0.6, step * 0.15);

    // Holes.
    for (let row = 0; row < engine.rows; row++) {
      for (let col = 0; col < engine.cols; col++) {
        ctx.beginPath();
        ctx.arc(sx(col), sy(row), padR, 0, Math.PI * 2);
        ctx.fillStyle = palette.pad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx(col), sy(row), holeR, 0, Math.PI * 2);
        ctx.fillStyle = palette.hole;
        ctx.fill();
      }
    }

    // Ratsnest (airwires) — drawn under components.
    if (airwires.length) {
      ctx.save();
      ctx.strokeStyle = palette.airwire;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const w of airwires) {
        ctx.beginPath();
        ctx.moveTo(sx(w.a.col), sy(w.a.row));
        ctx.lineTo(sx(w.b.col), sy(w.b.row));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Traces.
    const crossSet = new Set(crossingIds);
    for (const t of engine.getTraces()) {
      if (t.path.length < 2) continue;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const crossing = crossSet.has(t.id);
      if (crossing) {
        ctx.strokeStyle = palette.danger;
        ctx.lineWidth = Math.max(2, step * 0.2);
      } else if (t.layer === "jumper") {
        ctx.strokeStyle = palette.jumperTrace;
        ctx.lineWidth = Math.max(1.5, step * 0.14);
        ctx.setLineDash([step * 0.35, step * 0.25]);
      } else {
        ctx.strokeStyle = palette.bottomTrace;
        ctx.lineWidth = Math.max(2, step * 0.18);
      }
      if (t.id === selectedTraceId) {
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(4, step * 0.3);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(sx(t.path[0].col), sy(t.path[0].row));
        for (let i = 1; i < t.path.length; i++) ctx.lineTo(sx(t.path[i].col), sy(t.path[i].row));
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(sx(t.path[0].col), sy(t.path[0].row));
      for (let i = 1; i < t.path.length; i++) ctx.lineTo(sx(t.path[i].col), sy(t.path[i].row));
      ctx.stroke();
      ctx.restore();
    }

    // Proposed route (awaiting approval) + live preview.
    const drawPoly = (path: HoleCoord[], color: string, lw: number, dash: number[]) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(sx(path[0].col), sy(path[0].row));
      for (let i = 1; i < path.length; i++) ctx.lineTo(sx(path[i].col), sy(path[i].row));
      ctx.stroke();
      ctx.restore();
    };
    if (previewPath && previewPath.length >= 2) drawPoly(previewPath, "rgba(255,255,255,0.45)", Math.max(1.5, step * 0.12), [step * 0.25, step * 0.2]);
    if (pendingPath && pendingPath.length >= 2) drawPoly(pendingPath, palette.routeStart, Math.max(2.5, step * 0.22), []);
    if (drawPath && drawPath.length >= 1) {
      if (drawPath.length >= 2) drawPoly(drawPath, palette.routeStart, Math.max(2.5, step * 0.2), []);
      ctx.fillStyle = palette.routeStart;
      for (const h of drawPath) {
        ctx.beginPath();
        ctx.arc(sx(h.col), sy(h.row), Math.max(2, step * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Route start highlight.
    if (routing && routeStart) {
      ctx.beginPath();
      ctx.arc(sx(routeStart.col), sy(routeStart.row), Math.max(3, step * 0.4), 0, Math.PI * 2);
      ctx.strokeStyle = palette.routeStart;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Components (placed only; one pinPositions read each, reused for bounds).
    for (const c of engine.getPlacedComponents()) {
      const pins = engine.pinPositions(c.id);
      const bounds = boundsOf(pins.map((p) => p.coord));
      const { minC, maxC, minR, maxR } = bounds;
      const fits = pins.every((p) => engine.hasHole(p.coord.col, p.coord.row));
      const selected = c.id === selectedId;

      // body (flip-safe rect from both corners)
      const r = screenRectFromBounds(bounds, sx, sy, step * 0.45);
      ctx.fillStyle = fits ? "rgba(78,161,255,0.14)" : "rgba(255,90,90,0.18)";
      ctx.strokeStyle = selected ? palette.accent : fits ? "rgba(78,161,255,0.5)" : "rgba(255,90,90,0.7)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.stroke();

      // pins
      for (const p of pins) {
        ctx.beginPath();
        ctx.arc(sx(p.coord.col), sy(p.coord.row), Math.max(1.5, step * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = fits ? palette.accent : palette.danger;
        ctx.fill();
      }

      // ref label
      if (step >= 12) {
        ctx.fillStyle = palette.text;
        ctx.font = `${Math.min(14, step * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.ref, sx((minC + maxC) / 2), sy((minR + maxR) / 2));
      }
    }

    // Axis labels.
    if (step >= 14) {
      ctx.fillStyle = palette.muted;
      ctx.font = `${Math.min(16, step * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      for (let col = 0; col < engine.cols; col++) ctx.fillText(colToLabel(col), sx(col), sy(0) - step * 0.85);
      ctx.textAlign = "right";
      for (let row = 0; row < engine.rows; row++) ctx.fillText(rowToLabel(row), sx(0) - step * 0.7, sy(row));
    }
  }, [engine, view, size, rev, selectedId, airwires, flipped, routing, routeStart, crossingIds, selectedTraceId, pendingPath, previewPath, drawPath]);

  // Interaction.
  const onMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const hole = holeAt(px, py);

    if (routing) {
      if (engine.hasHole(hole.col, hole.row)) onRoutePick?.(hole);
      return;
    }
    if (placingComponentId) {
      if (engine.hasHole(hole.col, hole.row)) onPlaceComponent?.(placingComponentId, hole);
      return;
    }
    if (armedFootprint) {
      onPlace?.(armedFootprint, hole);
      return;
    }
    const hit = hitTest(hole);
    if (hit) {
      onSelect?.(hit.id);
      onSelectTrace?.(null);
      const c = engine.getComponent(hit.id)!;
      compDrag.current = { id: hit.id, dc: hole.col - c.anchor.col, dr: hole.row - c.anchor.row, moved: false };
      return;
    }
    const tHit = traceHitTest(worldAt(px, py));
    if (tHit) {
      onSelectTrace?.(tHit);
      onSelect?.(null);
      return;
    }
    onSelect?.(null);
    onSelectTrace?.(null);
    pan.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (routing) {
      const rect = canvasRef.current!.getBoundingClientRect();
      onHover?.(holeAt(e.clientX - rect.left, e.clientY - rect.top));
      return;
    }
    if (compDrag.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const hole = holeAt(e.clientX - rect.left, e.clientY - rect.top);
      const d = compDrag.current;
      if (!d.moved) {
        onMoveStart?.(); // snapshot for undo on the first actual move
        d.moved = true;
      }
      onMove?.(d.id, { col: hole.col - d.dc, row: hole.row - d.dr });
      return;
    }
    const p = pan.current;
    if (p) setView((v) => ({ ...v, offsetX: p.ox + (e.clientX - p.x), offsetY: p.oy + (e.clientY - p.y) }));
  };

  const endDrag = () => {
    pan.current = null;
    compDrag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    setView((v) => {
      const newScale = Math.min(6, Math.max(0.08, v.scale * Math.exp(-e.deltaY * 0.0015)));
      const worldX = (px - v.offsetX) / (CELL_PX * v.scale);
      const worldY = (py - v.offsetY) / (CELL_PX * v.scale);
      return { scale: newScale, offsetX: px - worldX * CELL_PX * newScale, offsetY: py - worldY * CELL_PX * newScale };
    });
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", cursor: routing ? "crosshair" : armedFootprint || placingComponentId ? "copy" : "grab" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={() => { if (routing) onRouteFinish?.(); }}
        onWheel={onWheel}
      />
    </div>
  );
}
