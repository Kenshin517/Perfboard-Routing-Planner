/**
 * Conversions between grid indices and human labels (e.g. "H7").
 *
 * Columns use spreadsheet-style bijective base-26 letters: A..Z, AA, AB, ...
 * Rows use 1-based numbers. So (col 0, row 0) -> "A1", (col 7, row 6) -> "H7".
 *
 * This is the single source of truth for labelling: both the engine and the
 * Canvas UI import from here, so coordinate text can never drift between them.
 */

import type { HoleCoord } from "./types";

/** 0-based column index -> letter label. 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colToLabel(col: number): string {
  if (!Number.isInteger(col) || col < 0) {
    throw new Error(`colToLabel: col must be a non-negative integer, got ${col}`);
  }
  let label = "";
  let n = col + 1; // shift to 1-based for bijective base-26
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Letter label -> 0-based column index. "A" -> 0, "AA" -> 26. Case-insensitive. */
export function labelToCol(label: string): number {
  const up = label.toUpperCase();
  if (!/^[A-Z]+$/.test(up)) {
    throw new Error(`labelToCol: expected letters only, got "${label}"`);
  }
  let n = 0;
  for (let i = 0; i < up.length; i++) {
    n = n * 26 + (up.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** 0-based row index -> 1-based number label. 0 -> "1". */
export function rowToLabel(row: number): string {
  if (!Number.isInteger(row) || row < 0) {
    throw new Error(`rowToLabel: row must be a non-negative integer, got ${row}`);
  }
  return String(row + 1);
}

/** Number label -> 0-based row index. "1" -> 0. */
export function labelToRow(label: string): number {
  if (!/^\d+$/.test(label)) {
    throw new Error(`labelToRow: expected digits only, got "${label}"`);
  }
  const n = parseInt(label, 10);
  if (n < 1) throw new Error(`labelToRow: row number must be >= 1, got ${n}`);
  return n - 1;
}

/** Hole coord -> full label, e.g. { col: 7, row: 6 } -> "H7". */
export function coordToLabel(coord: HoleCoord): string {
  return colToLabel(coord.col) + rowToLabel(coord.row);
}

/** Full label -> hole coord, e.g. "H7" -> { col: 7, row: 6 }. Case-insensitive. */
export function labelToCoord(label: string): HoleCoord {
  const m = /^([A-Za-z]+)(\d+)$/.exec(label.trim());
  if (!m) {
    throw new Error(`labelToCoord: cannot parse "${label}" (expected e.g. "H7")`);
  }
  return { col: labelToCol(m[1]), row: labelToRow(m[2]) };
}
