/**
 * 1:1 PDF export. Two pages: a Placement guide (top view) for dropping parts in,
 * and a Routing guide (bottom view, mirrored) for soldering. Both carry a 50mm
 * calibration box so you can verify the printout came out Actual Size.
 */

import type { jsPDF } from "jspdf";
import type { BoardEngine } from "@/engine/BoardEngine";
import { holeMm, pageSizeMm, type PrintLayout } from "@/engine/printGeometry";
import { coordToLabel } from "@/engine/coordinates";

const MARGIN = 12;
const CAL_MM = 50;

function drawCalibration(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([], 0);
  doc.line(x, y, x + CAL_MM, y);
  doc.line(x, y - 2, x, y + 2);
  doc.line(x + CAL_MM, y - 2, x + CAL_MM, y + 2);
  doc.setFontSize(8);
  doc.text("50 mm — ukur pakai penggaris; harus tepat 50 mm (print 100% / Actual Size)", x, y + 5);
}

function drawPage(doc: jsPDF, engine: BoardEngine, mirror: boolean) {
  const cfg = engine.getConfig();
  const layout: PrintLayout = { cols: cfg.cols, rows: cfg.rows, pitchMm: cfg.pitchMm, marginMm: MARGIN, mirror };

  // Title + instruction.
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text(mirror ? "ROUTING GUIDE — bottom (solder side, mirrored)" : "PLACEMENT GUIDE — top (component side)", MARGIN, 8);

  // Pads.
  doc.setDrawColor(150);
  doc.setLineWidth(0.15);
  for (const h of engine.getHoles()) {
    const p = holeMm(h, layout);
    doc.circle(p.x, p.y, 0.7, "S");
  }

  if (!mirror) {
    // Component bodies + refs + pins (placement side).
    for (const c of engine.getComponents()) {
      const pins = engine.pinPositions(c.id).map((p) => holeMm(p.coord, layout));
      const xs = pins.map((p) => p.x), ys = pins.map((p) => p.y);
      const x0 = Math.min(...xs) - 1.2, y0 = Math.min(...ys) - 1.2;
      const w = Math.max(...xs) - Math.min(...xs) + 2.4, h = Math.max(...ys) - Math.min(...ys) + 2.4;
      doc.setDrawColor(40, 90, 170);
      doc.setLineWidth(0.3);
      doc.rect(x0, y0, w, h, "S");
      doc.setFillColor(40, 90, 170);
      for (const p of pins) doc.circle(p.x, p.y, 0.9, "F");
      doc.setTextColor(40, 90, 170);
      doc.setFontSize(7);
      doc.text(c.ref, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, { align: "center", baseline: "middle" });
    }
  } else {
    // Traces + pins (routing side).
    for (const t of engine.getTraces()) {
      if (t.path.length < 2) continue;
      const pts = t.path.map((h) => holeMm(h, layout));
      if (t.layer === "jumper") {
        doc.setDrawColor(190, 120, 0);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([1.2, 0.8], 0);
      } else {
        doc.setDrawColor(0, 120, 40);
        doc.setLineWidth(0.6);
        doc.setLineDashPattern([], 0);
      }
      for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
    doc.setLineDashPattern([], 0);
    doc.setFillColor(0, 0, 0);
    for (const p of engine.allPins()) {
      const m = holeMm(p.coord, layout);
      doc.circle(m.x, m.y, 0.9, "F");
    }
  }

  // Corner coordinate hints.
  doc.setTextColor(120);
  doc.setFontSize(6);
  const a1 = holeMm({ col: 0, row: 0 }, layout);
  doc.text(coordToLabel({ col: 0, row: 0 }), a1.x, a1.y - 2.5, { align: "center" });

  // Calibration below the board.
  const span = (cfg.rows - 1) * cfg.pitchMm;
  drawCalibration(doc, MARGIN, MARGIN + span + 9);
}

/** Build and download the two-page 1:1 PDF. jsPDF is loaded on demand. */
export async function exportPdf(engine: BoardEngine, filename = "perfboard-print.pdf") {
  const { jsPDF } = await import("jspdf");
  const cfg = engine.getConfig();
  const layout: PrintLayout = { cols: cfg.cols, rows: cfg.rows, pitchMm: cfg.pitchMm, marginMm: MARGIN, mirror: false };
  const size = pageSizeMm(layout, CAL_MM);
  const doc = new jsPDF({ unit: "mm", format: [size.w, size.h], orientation: size.w >= size.h ? "landscape" : "portrait" });

  drawPage(doc, engine, false);
  doc.addPage([size.w, size.h], size.w >= size.h ? "landscape" : "portrait");
  drawPage(doc, engine, true);

  doc.save(filename);
}
