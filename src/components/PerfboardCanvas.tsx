"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardEngine } from "@/engine/BoardEngine";
import { colToLabel, rowToLabel } from "@/engine/coordinates";

/** Base pixels per hole at zoom = 1. Pan/zoom scale this. */
const CELL_PX = 30;
/** World-unit margin reserved around the grid for axis labels. */
const MARGIN = 1.2;

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Props {
  engine: BoardEngine;
  /** Changing this number re-fits the board to the viewport (e.g. "Reset view"). */
  resetToken?: number;
}

export default function PerfboardCanvas({ engine, resetToken = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Track container size (DPR-aware canvas).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit the whole board into the viewport, centred.
  const fit = useCallback(() => {
    const { w, h } = size;
    if (w === 0 || h === 0) return;
    const worldW = (engine.cols - 1 + MARGIN * 2) * CELL_PX;
    const worldH = (engine.rows - 1 + MARGIN * 2) * CELL_PX;
    const scale = Math.min(w / worldW, h / worldH) * 0.98;
    const offsetX = (w - (engine.cols - 1) * CELL_PX * scale) / 2;
    const offsetY = (h - (engine.rows - 1) * CELL_PX * scale) / 2;
    setView({ scale, offsetX, offsetY });
  }, [engine, size]);

  // Re-fit on size change, engine change, or reset request.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, size.w, size.h, resetToken]);

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
    const sx = (col: number) => col * CELL_PX * scale + offsetX;
    const sy = (row: number) => row * CELL_PX * scale + offsetY;
    const step = CELL_PX * scale;

    const padR = Math.max(1.5, step * 0.34);
    const holeR = Math.max(0.6, step * 0.15);

    // Holes (copper pad + drilled hole).
    for (let row = 0; row < engine.rows; row++) {
      for (let col = 0; col < engine.cols; col++) {
        const x = sx(col);
        const y = sy(row);
        ctx.beginPath();
        ctx.arc(x, y, padR, 0, Math.PI * 2);
        ctx.fillStyle = "#c98a4d";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, holeR, 0, Math.PI * 2);
        ctx.fillStyle = "#0f1216";
        ctx.fill();
      }
    }

    // Axis labels (only when there's room to read them).
    if (step >= 14) {
      ctx.fillStyle = "#8b98a5";
      ctx.font = `${Math.min(16, step * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let col = 0; col < engine.cols; col++) {
        ctx.fillText(colToLabel(col), sx(col), sy(0) - step * 0.85);
      }
      ctx.textAlign = "right";
      for (let row = 0; row < engine.rows; row++) {
        ctx.fillText(rowToLabel(row), sx(0) - step * 0.7, sy(row));
      }
    }
  }, [engine, view, size]);

  // Pan.
  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, offsetX: d.ox + (e.clientX - d.x), offsetY: d.oy + (e.clientY - d.y) }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  // Zoom around the cursor.
  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.min(6, Math.max(0.08, v.scale * factor));
      // Keep the world point under the cursor fixed.
      const worldX = (px - v.offsetX) / (CELL_PX * v.scale);
      const worldY = (py - v.offsetY) / (CELL_PX * v.scale);
      return {
        scale: newScale,
        offsetX: px - worldX * CELL_PX * newScale,
        offsetY: py - worldY * CELL_PX * newScale,
      };
    });
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", cursor: drag.current ? "grabbing" : "grab" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onWheel={onWheel}
      />
    </div>
  );
}
