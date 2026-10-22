/**
 * BoardEngine — the single headless seam for the whole app.
 *
 * It owns board state and domain logic with NO rendering. Every behavioural
 * test targets this class; the Canvas/React UI is a thin view on top of it.
 */

import type {
  BoardConfig,
  BoardState,
  Footprint,
  HoleCoord,
  PlacedComponent,
  Rotation,
} from "./types";
import { coordToLabel } from "./coordinates";
import { DEFAULT_FOOTPRINTS, rotateOffset } from "./footprints";

/** Classic dot-perfboard hole pitch. */
export const DEFAULT_PITCH_MM = 2.54;

export interface CreateBoardOptions {
  cols: number;
  rows: number;
  /** Defaults to {@link DEFAULT_PITCH_MM}. */
  pitchMm?: number;
}

/** A pin resolved to an absolute board position. */
export interface ResolvedPin {
  componentId: string;
  ref: string;
  pin: string;
  coord: HoleCoord;
}

export interface AddComponentInput {
  footprint: string;
  ref: string;
  value?: string;
  anchor: HoleCoord;
  rotation?: Rotation;
}

/** Factory: build a fresh board. */
export function createBoard(opts: CreateBoardOptions): BoardEngine {
  return new BoardEngine({
    config: {
      cols: opts.cols,
      rows: opts.rows,
      pitchMm: opts.pitchMm ?? DEFAULT_PITCH_MM,
    },
    components: [],
    traces: [],
    nets: [],
  });
}

export class BoardEngine {
  private state: BoardState;
  private footprints = new Map<string, Footprint>();
  private seq = 0;

  constructor(state: BoardState, footprints: Footprint[] = DEFAULT_FOOTPRINTS) {
    const { config } = state;
    if (!Number.isInteger(config.cols) || config.cols <= 0) {
      throw new Error(`BoardEngine: cols must be a positive integer, got ${config.cols}`);
    }
    if (!Number.isInteger(config.rows) || config.rows <= 0) {
      throw new Error(`BoardEngine: rows must be a positive integer, got ${config.rows}`);
    }
    if (!(config.pitchMm > 0)) {
      throw new Error(`BoardEngine: pitchMm must be > 0, got ${config.pitchMm}`);
    }
    this.state = {
      config: { ...config },
      components: state.components ? state.components.map((c) => ({ ...c })) : [],
      traces: state.traces ? state.traces.map((t) => ({ ...t })) : [],
      nets: state.nets ? state.nets.map((n) => ({ ...n })) : [],
    };
    for (const fp of footprints) this.footprints.set(fp.name, fp);
    // Keep the id sequence ahead of any ids already in the loaded state.
    for (const c of this.state.components) this.bumpSeq(c.id);
    for (const t of this.state.traces) this.bumpSeq(t.id);
  }

  private bumpSeq(id: string) {
    const m = /(\d+)$/.exec(id);
    if (m) this.seq = Math.max(this.seq, parseInt(m[1], 10));
  }

  // ---- board basics ----

  getConfig(): BoardConfig {
    return { ...this.state.config };
  }

  /** Resize the board in place, keeping components and traces. */
  resize(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || cols <= 0) throw new Error(`resize: bad cols ${cols}`);
    if (!Number.isInteger(rows) || rows <= 0) throw new Error(`resize: bad rows ${rows}`);
    this.state.config.cols = cols;
    this.state.config.rows = rows;
  }

  get cols(): number {
    return this.state.config.cols;
  }

  get rows(): number {
    return this.state.config.rows;
  }

  holeCount(): number {
    return this.cols * this.rows;
  }

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

  getHoles(): HoleCoord[] {
    const holes: HoleCoord[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        holes.push({ col, row });
      }
    }
    return holes;
  }

  labelAt(coord: HoleCoord): string {
    if (!this.hasHole(coord.col, coord.row)) {
      throw new Error(`labelAt: no hole at col=${coord.col}, row=${coord.row}`);
    }
    return coordToLabel(coord);
  }

  // ---- footprints ----

  registerFootprint(fp: Footprint): void {
    this.footprints.set(fp.name, fp);
  }

  getFootprint(name: string): Footprint | undefined {
    return this.footprints.get(name);
  }

  listFootprints(): Footprint[] {
    return Array.from(this.footprints.values());
  }

  // ---- components ----

  /** Add a placed component. Throws if the footprint is unknown. Returns the new id. */
  addComponent(input: AddComponentInput): string {
    const fp = this.footprints.get(input.footprint);
    if (!fp) throw new Error(`addComponent: unknown footprint "${input.footprint}"`);
    const id = `cmp_${++this.seq}`;
    this.state.components.push({
      id,
      footprint: input.footprint,
      ref: input.ref,
      value: input.value,
      anchor: { ...input.anchor },
      rotation: input.rotation ?? 0,
    });
    return id;
  }

  getComponents(): PlacedComponent[] {
    return this.state.components.map((c) => ({ ...c }));
  }

  getComponent(id: string): PlacedComponent | undefined {
    const c = this.state.components.find((c) => c.id === id);
    return c ? { ...c } : undefined;
  }

  moveComponent(id: string, anchor: HoleCoord): void {
    const c = this.mustComponent(id);
    c.anchor = { ...anchor };
  }

  rotateComponent(id: string, rotation: Rotation): void {
    this.mustComponent(id).rotation = rotation;
  }

  /** Rotate by +90° clockwise (wraps). */
  rotateBy90(id: string): void {
    const c = this.mustComponent(id);
    c.rotation = (((c.rotation + 90) % 360) as Rotation);
  }

  removeComponent(id: string): void {
    const i = this.state.components.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`removeComponent: no component "${id}"`);
    this.state.components.splice(i, 1);
  }

  private mustComponent(id: string): PlacedComponent {
    const c = this.state.components.find((c) => c.id === id);
    if (!c) throw new Error(`no component "${id}"`);
    return c;
  }

  /** Absolute board positions of every pin of a component (respecting rotation). */
  pinPositions(id: string): ResolvedPin[] {
    const c = this.mustComponent(id);
    const fp = this.footprints.get(c.footprint);
    if (!fp) throw new Error(`pinPositions: unknown footprint "${c.footprint}"`);
    return fp.pins.map((p) => {
      const off = rotateOffset({ col: p.col, row: p.row }, c.rotation);
      return {
        componentId: c.id,
        ref: c.ref,
        pin: p.num,
        coord: { col: c.anchor.col + off.col, row: c.anchor.row + off.row },
      };
    });
  }

  /** True iff every pin of the component lands on a real hole. */
  componentFits(id: string): boolean {
    return this.pinPositions(id).every((p) => this.hasHole(p.coord.col, p.coord.row));
  }

  /** Every pin of every component, resolved to absolute positions. */
  allPins(): ResolvedPin[] {
    return this.state.components.flatMap((c) => this.pinPositions(c.id));
  }
}
