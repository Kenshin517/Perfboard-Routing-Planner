/**
 * PNG export — a quick snapshot for preview/sharing (NOT for 1:1 printing;
 * use the PDF for that). Renders to an offscreen canvas and downloads.
 */

import type { BoardEngine } from "@/engine/BoardEngine";
import { mirrorCol, screenRectFromBounds } from "@/lib/display";
import { palette } from "@/lib/theme";

const CELL = 34;
const MARGIN = 44;

export function exportPng(engine: BoardEngine, opts: { flipped?: boolean } = {}) {
  const flip = opts.flipped ?? false;
  const canvas = document.createElement("canvas");
  canvas.width = (engine.cols - 1) * CELL + MARGIN * 2;
  canvas.height = (engine.rows - 1) * CELL + MARGIN * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const sx = (c: number) => MARGIN + mirrorCol(c, engine.cols, flip) * CELL;
  const sy = (r: number) => MARGIN + r * CELL;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // pads
  for (const h of engine.getHoles()) {
    if (engine.isMountingBlocked(h.col, h.row)) continue;
    ctx.beginPath();
    ctx.arc(sx(h.col), sy(h.row), CELL * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = palette.pad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx(h.col), sy(h.row), CELL * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = palette.hole;
    ctx.fill();
  }
  for (const m of engine.getMountingHoles()) {
    ctx.beginPath();
    ctx.arc(sx(m.col), sy(m.row), CELL * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#e8e8ea";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx(m.col), sy(m.row), CELL * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = palette.bg;
    ctx.fill();
  }

  // traces
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const t of engine.getTraces()) {
    if (t.path.length < 2) continue;
    if (t.layer === "jumper") {
      ctx.strokeStyle = palette.jumperTrace;
      ctx.lineWidth = CELL * 0.14;
      ctx.setLineDash([CELL * 0.35, CELL * 0.25]);
    } else {
      ctx.strokeStyle = palette.bottomTrace;
      ctx.lineWidth = CELL * 0.18;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(sx(t.path[0].col), sy(t.path[0].row));
    for (let i = 1; i < t.path.length; i++) ctx.lineTo(sx(t.path[i].col), sy(t.path[i].row));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // components
  for (const c of engine.getComponents()) {
    const pins = engine.pinPositions(c.id).map((p) => p.coord);
    const bounds = engine.componentBounds(c.id);
    const { minC, maxC, minR, maxR } = bounds;
    const r = screenRectFromBounds(bounds, sx, sy, CELL * 0.45);
    ctx.fillStyle = "rgba(78,161,255,0.14)";
    ctx.strokeStyle = "rgba(78,161,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    for (const p of pins) {
      ctx.beginPath();
      ctx.arc(sx(p.col), sy(p.row), CELL * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = palette.text;
    ctx.font = `${CELL * 0.38}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.ref, sx((minC + maxC) / 2), sy((minR + maxR) / 2));
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = flip ? "perfboard-bottom.png" : "perfboard-top.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
