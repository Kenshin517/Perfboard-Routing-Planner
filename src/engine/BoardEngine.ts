/**
 * BoardEngine — the single headless seam for the whole app.
 *
 * It owns board state and domain logic with NO rendering. Every behavioural
 * test targets this class; the Canvas/React UI is a thin view on top of it.
 * Later tickets extend it (components, placement, traces, routing, serialise,
 * build-list) — all still here, still headless, still the one seam.
 */

import type { BoardConfig, BoardState, HoleCoord } from "./types";
import { coordToLabel } from "./coordinates";

/** Classic dot-perfboard hole pitch. */
export const DEFAULT_PITCH_MM = 2.54;

export interface CreateBoardOptions {
  cols: number;
  rows: number;
  /** Defaults to {@link DEFAULT_PITCH_MM}. */
  pitchMm?: number;
}

/** Factory: build a fresh board. */
export function createBoard(opts: CreateBoardOptions): BoardEngine {
  return new BoardEngine({
    cols: opts.cols,
    rows: opts.rows,
    pitchMm: opts.pitchMm ?? DEFAULT_PITCH_MM,
  });
}

export class BoardEngine {
  private state: BoardState;

  constructor(config: BoardConfig) {
    if (!Number.isInteger(config.cols) || config.cols <= 0) {
      throw new Error(`BoardEngine: cols must be a positive integer, got ${config.cols}`);
    }
    if (!Number.isInteger(config.rows) || config.rows <= 0) {
      throw new Error(`BoardEngine: rows must be a positive integer, got ${config.rows}`);
    }
    if (!(config.pitchMm > 0)) {
      throw new Error(`BoardEngine: pitchMm must be > 0, got ${config.pitchMm}`);
    }
    this.state = { config: { ...config } };
  }

  /** Copy of the board config (safe to mutate by caller). */
  getConfig(): BoardConfig {
    return { ...this.state.config };
  }

  get cols(): number {
    return this.state.config.cols;
  }

  get rows(): number {
    return this.state.config.rows;
  }

  /** Total number of holes on the board. */
  holeCount(): number {
    return this.cols * this.rows;
  }

  /** True iff (col, row) is a real hole inside the board bounds. */
  hasHole(col: number, row: number): boolean {
    return (
      Number.isInteger(col) &&
      Number.isInteger(row) &&
      col >= 0 &&
      row >= 0 &&
      col < this.cols &&
      row < this.rows
    );
  }

  /**
   * Every hole in the board, in row-major order (row 0 first, left to right).
   * The UI iterates this to draw the grid.
   */
  getHoles(): HoleCoord[] {
    const holes: HoleCoord[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        holes.push({ col, row });
      }
    }
    return holes;
  }

  /** Human label for a hole, e.g. { col: 7, row: 6 } -> "H7". Throws if out of bounds. */
  labelAt(coord: HoleCoord): string {
    if (!this.hasHole(coord.col, coord.row)) {
      throw new Error(`labelAt: no hole at col=${coord.col}, row=${coord.row}`);
    }
    return coordToLabel(coord);
  }
}
