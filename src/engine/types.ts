/**
 * Core domain types for the perfboard model.
 *
 * Units are HOLE-GRID integers everywhere in the engine (col, row),
 * never millimetres. Conversion to mm happens only at the export/print
 * layer (a later ticket). See the spec: "Model board & koordinat".
 */

/** Physical configuration of a dot-perfboard. */
export interface BoardConfig {
  /** Number of hole columns (x), left to right. */
  cols: number;
  /** Number of hole rows (y), top to bottom. */
  rows: number;
  /** Centre-to-centre hole spacing in millimetres (classic perfboard = 2.54). */
  pitchMm: number;
}

/** A single hole position on the grid, 0-based. */
export interface HoleCoord {
  /** Column index, 0-based (0 = leftmost). */
  col: number;
  /** Row index, 0-based (0 = topmost). */
  row: number;
}

/** Full serialisable state of a board. Grows in later tickets (components, traces, nets). */
export interface BoardState {
  config: BoardConfig;
}
