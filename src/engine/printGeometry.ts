/**
 * Pure millimetre geometry for printing. The whole point of the print feature
 * is that it comes out 1:1, so this math (and the calibration box) must be exact.
 * Tested in isolation; the PDF layer just draws what these return.
 */

import type { HoleCoord } from "./types";

export interface PrintLayout {
  cols: number;
  rows: number;
  pitchMm: number;
  /** Page margin around the board, in mm. */
  marginMm: number;
  /** True for the routing (solder-side) guide: mirror horizontally. */
  mirror: boolean;
}

/** Physical position (mm) of a hole on the page, origin at the top-left margin. */
export function holeMm(coord: HoleCoord, layout: PrintLayout): { x: number; y: number } {
  const col = layout.mirror ? layout.cols - 1 - coord.col : coord.col;
  return {
    x: layout.marginMm + col * layout.pitchMm,
    y: layout.marginMm + coord.row * layout.pitchMm,
  };
}

/** Overall board footprint in mm (hole-centre span). */
export function boardSpanMm(layout: PrintLayout): { w: number; h: number } {
  return {
    w: (layout.cols - 1) * layout.pitchMm,
    h: (layout.rows - 1) * layout.pitchMm,
  };
}

/** Total page size in mm needed to hold the board plus margins (+ calibration strip). */
export function pageSizeMm(layout: PrintLayout, calibrationMm = 50): { w: number; h: number } {
  const span = boardSpanMm(layout);
  return {
    w: Math.max(span.w, calibrationMm) + layout.marginMm * 2,
    h: span.h + layout.marginMm * 2 + 14, // room for the calibration strip + caption
  };
}
