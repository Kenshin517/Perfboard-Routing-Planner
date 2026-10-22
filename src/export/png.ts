/**
 * PNG export — a quick snapshot for preview/sharing (NOT for 1:1 printing;
 * use the PDF for that). Renders to an offscreen canvas and downloads.
 */

import type { BoardEngine } from "@/engine/BoardEngine";

const CELL = 34;
const MARGIN = 44;

export function exportPng(engine: BoardEngine, opts: { flipped?: boolean } = {}) {
  const flip = opts.flipped ?? false;
  const canvas = document.createElement("canvas");
  canvas.width = (engine.cols - 1) * CELL + MARGIN * 2;
  canvas.height = (engine.rows - 1) * CELL + MARGIN * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dispCol = (c: number) => (flip ? engine.cols - 1 - c : c);
  const sx = (c: number) => MARGIN + dispCol(c) * CELL;
  const sy = (r: number) => MARGIN + r * CELL;

  ctx.fillStyle = "#0f1216";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // pads
  for (const h of engine.getHoles()) {
    ctx.beginPath();
    ctx.arc(sx(h.col), sy(h.row), CELL * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "#c98a4d";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx(h.col), sy(h.row), CELL * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = "#0f1216";
    ctx.fill();
  }

  // traces
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const t of engine.getTraces()) {
    if (t.path.length < 2) continue;
    if (t.layer === "jumper") {
      ctx.strokeStyle = "#e0b34a";
      ctx.lineWidth = CELL * 0.14;
      ctx.setLineDash([CELL * 0.35, CELL * 0.25]);
    } else {
      ctx.strokeStyle = "#49c06a";
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
    const minC = Math.min(...pins.map((p) => p.col)), maxC = Math.max(...pins.map((p) => p.col));
    const minR = Math.min(...pins.map((p) => p.row)), maxR = Math.max(...pins.map((p) => p.row));
    const x0 = sx(flip ? maxC : minC) - CELL * 0.45;
    const y0 = sy(minR) - CELL * 0.45;
    const w = (maxC - minC + 0.9) * CELL, h = (maxR - minR + 0.9) * CELL;
    ctx.fillStyle = "rgba(78,161,255,0.14)";
    ctx.strokeStyle = "rgba(78,161,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#4ea1ff";
    for (const p of pins) {
      ctx.beginPath();
      ctx.arc(sx(p.col), sy(p.row), CELL * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e6edf3";
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
