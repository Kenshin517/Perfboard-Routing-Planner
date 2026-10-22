/**
 * BoardEngine — the single headless seam for the whole app.
 *
 * It owns board state and domain logic with NO rendering. Every behavioural
 * test targets this class; the Canvas/React UI is a thin view on top of it.
 */

import type {
  Airwire,
  BoardConfig,
  BoardState,
  Footprint,
  HoleCoord,
  Layer,
  Net,
  PinDef,
  PlacedComponent,
  Rotation,
  Trace,
} from "./types";
import { coordToLabel } from "./coordinates";
import { DEFAULT_FOOTPRINTS, makeGenericFootprint, rotateOffset } from "./footprints";
import { mapKicadFootprint, type ParsedNetlist } from "./netlist";
import { findPath } from "./router";
import { pathsIntersect } from "./crossings";

export interface RouteOptions {
  layer?: Layer;
  /** Extra blocked cells for the pathfinder (e.g. existing bare traces). */
  isBlocked?: (c: HoleCoord) => boolean;
}

/** Minimal union-find over integer ids. */
class UnionFind {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    this.p[ra] = rb;
    return true;
  }
}

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

  // ---- nets & traces (used by later tickets; included here for serialisation) ----

  getNets(): Net[] {
    return this.state.nets.map((n) => ({ ...n, pins: n.pins.map((p) => ({ ...p })) }));
  }

  setNets(nets: Net[]): void {
    this.state.nets = nets.map((n) => ({ ...n, pins: n.pins.map((p) => ({ ...p })) }));
  }

  getTraces(): Trace[] {
    return this.state.traces.map((t) => ({ ...t, path: t.path.map((h) => ({ ...h })) }));
  }

  // ---- netlist import ----

  /**
   * Instantiate components + nets from a parsed KiCad netlist. Known footprints
   * map to the library; unknown ones get a generic part with the netlist's own
   * pin names. Components are auto-placed in a simple flow layout for the user to
   * rearrange. Returns a summary.
   */
  loadNetlist(parsed: ParsedNetlist): { added: number; generic: string[] } {
    // Pin names per ref, as they appear in the netlist (for generic fallback).
    const pinsByRef = new Map<string, string[]>();
    for (const net of parsed.nets) {
      for (const node of net.nodes) {
        const arr = pinsByRef.get(node.ref) ?? [];
        if (!arr.includes(node.pin)) arr.push(node.pin);
        pinsByRef.set(node.ref, arr);
      }
    }

    const generic: string[] = [];
    let cx = 0, cy = 0, rowH = 0;

    for (const comp of parsed.components) {
      let fpName = mapKicadFootprint(comp.footprint);
      if (!fpName || !this.footprints.has(fpName)) {
        const names = pinsByRef.get(comp.ref) ?? ["1"];
        const genName = `GEN_${comp.ref}`;
        const pins: PinDef[] = names.map((n, i) => ({ num: n, col: i, row: 0 }));
        this.registerFootprint({ name: genName, pins, body: { w: names.length, h: 1, height: 6 } });
        fpName = genName;
        generic.push(comp.ref);
      }
      const fp = this.footprints.get(fpName)!;
      if (cx + fp.body.w > this.cols) {
        cx = 0;
        cy += rowH + 1;
        rowH = 0;
      }
      this.addComponent({ footprint: fpName, ref: comp.ref, value: comp.value, anchor: { col: cx, row: cy } });
      cx += fp.body.w + 1;
      rowH = Math.max(rowH, fp.body.h);
    }

    this.setNets(parsed.nets.map((n) => ({ name: n.name, pins: n.nodes.map((x) => ({ ref: x.ref, pin: x.pin })) })));
    return { added: parsed.components.length, generic };
  }

  /**
   * Airwires (ratsnest): the still-unrouted connections. Per net, the minimal set
   * of links needed to join its pins, skipping pairs already connected through a
   * shared hole or an existing trace.
   */
  ratsnest(): Airwire[] {
    const pins = this.allPins();
    const key = (c: HoleCoord) => `${c.col},${c.row}`;
    const pinKey = new Map<string, number>();
    const byCoord = new Map<string, number[]>();
    pins.forEach((p, i) => {
      pinKey.set(`${p.ref}/${p.pin}`, i);
      const k = key(p.coord);
      const arr = byCoord.get(k) ?? [];
      arr.push(i);
      byCoord.set(k, arr);
    });

    const uf = new UnionFind(pins.length);
    // pins sharing a hole are the same node
    for (const arr of byCoord.values()) for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
    // pins joined by an existing trace
    for (const t of this.state.traces) {
      const onPath = new Set(t.path.map(key));
      const hit = pins.map((p, i) => (onPath.has(key(p.coord)) ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < hit.length; i++) uf.union(hit[0], hit[i]);
    }

    const wires: Airwire[] = [];
    for (const net of this.state.nets) {
      const idx = net.pins
        .map((p) => pinKey.get(`${p.ref}/${p.pin}`))
        .filter((i): i is number => i !== undefined);
      if (idx.length < 2) continue;
      // Kruskal over this net's pins using the shared union-find.
      const edges: { a: number; b: number; d: number }[] = [];
      for (let i = 0; i < idx.length; i++)
        for (let j = i + 1; j < idx.length; j++) {
          const a = pins[idx[i]].coord, b = pins[idx[j]].coord;
          edges.push({ a: idx[i], b: idx[j], d: Math.abs(a.col - b.col) + Math.abs(a.row - b.row) });
        }
      edges.sort((x, y) => x.d - y.d);
      for (const e of edges) {
        if (uf.union(e.a, e.b)) {
          wires.push({ net: net.name, a: { ...pins[e.a].coord }, b: { ...pins[e.b].coord } });
        }
      }
    }
    return wires;
  }

  // ---- routing ----

  /** The resolved pin located exactly at a hole, if any. */
  pinAt(coord: HoleCoord): ResolvedPin | undefined {
    return this.allPins().find((p) => p.coord.col === coord.col && p.coord.row === coord.row);
  }

  /** Net name that owns the pin at this hole, if any. */
  netAt(coord: HoleCoord): string | undefined {
    const pin = this.pinAt(coord);
    if (!pin) return undefined;
    return this.state.nets.find((n) => n.pins.some((x) => x.ref === pin.ref && x.pin === pin.pin))?.name;
  }

  /** Add a trace from an explicit hole path. Returns its id. */
  addTrace(path: HoleCoord[], opts: { layer?: Layer; net?: string } = {}): string {
    if (path.length < 2) throw new Error("addTrace: path needs >= 2 holes");
    for (const h of path) if (!this.hasHole(h.col, h.row)) throw new Error(`addTrace: hole out of bounds ${h.col},${h.row}`);
    const id = `trc_${++this.seq}`;
    this.state.traces.push({
      id,
      layer: opts.layer ?? "bottom-copper",
      net: opts.net,
      path: path.map((h) => ({ ...h })),
    });
    return id;
  }

  /**
   * Route a connection between two holes with A*, add it as a trace.
   * The net is auto-detected when both ends belong to the same net.
   * Returns the trace id, or null if no path exists.
   */
  routePadToPad(a: HoleCoord, b: HoleCoord, opts: RouteOptions = {}): string | null {
    const path = findPath(a, b, { cols: this.cols, rows: this.rows, isBlocked: opts.isBlocked });
    if (!path) return null;
    const na = this.netAt(a), nb = this.netAt(b);
    return this.addTrace(path, { layer: opts.layer ?? "bottom-copper", net: na && na === nb ? na : undefined });
  }

  removeTrace(id: string): void {
    const i = this.state.traces.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`removeTrace: no trace "${id}"`);
    this.state.traces.splice(i, 1);
  }

  setTraceLayer(id: string, layer: Layer): void {
    const t = this.state.traces.find((t) => t.id === id);
    if (!t) throw new Error(`setTraceLayer: no trace "${id}"`);
    t.layer = layer;
  }

  // ---- crossing detection ----

  /**
   * Pairs of bottom-copper traces that would short: different nets whose bare
   * wires touch or cross. (Jumper-layer traces are insulated and never conflict.)
   */
  crossings(): { a: string; b: string }[] {
    const bare = this.state.traces.filter((t) => t.layer === "bottom-copper");
    const netKey = (t: Trace) => t.net ?? `__trace_${t.id}`;
    const out: { a: string; b: string }[] = [];
    for (let i = 0; i < bare.length; i++) {
      for (let j = i + 1; j < bare.length; j++) {
        if (netKey(bare[i]) === netKey(bare[j])) continue; // same net = junction, fine
        if (pathsIntersect(bare[i].path, bare[j].path)) out.push({ a: bare[i].id, b: bare[j].id });
      }
    }
    return out;
  }

  /** Trace counts, for the score display. */
  counts(): { traces: number; jumpers: number; bottomCrossings: number } {
    return {
      traces: this.state.traces.length,
      jumpers: this.state.traces.filter((t) => t.layer === "jumper").length,
      bottomCrossings: this.crossings().length,
    };
  }

  /**
   * Resolve all bottom-copper crossings by promoting conflicting traces to the
   * jumper layer (greedy). Returns how many traces were promoted.
   */
  promoteCrossingsToJumper(): number {
    let promoted = 0;
    for (let guard = 0; guard < 100000; guard++) {
      const cx = this.crossings();
      if (cx.length === 0) break;
      this.setTraceLayer(cx[0].b, "jumper");
      promoted++;
    }
    return promoted;
  }

  // ---- serialisation ----

  /**
   * Full, self-contained project snapshot. Footprints actually referenced by
   * components are embedded so a custom part survives export/import.
   */
  serialize(): SerializedProject {
    const used = new Set(this.state.components.map((c) => c.footprint));
    const footprints: Footprint[] = [];
    for (const name of used) {
      const fp = this.footprints.get(name);
      if (fp) footprints.push(fp);
    }
    return {
      version: 1,
      state: {
        config: { ...this.state.config },
        components: this.state.components.map((c) => ({ ...c, anchor: { ...c.anchor } })),
        traces: this.getTraces(),
        nets: this.getNets(),
      },
      footprints,
    };
  }

  /** Rebuild an engine from a {@link serialize} snapshot (defaults + embedded footprints). */
  static fromSerialized(data: SerializedProject): BoardEngine {
    if (!data || data.version !== 1 || !data.state || !data.state.config) {
      throw new Error("fromSerialized: not a valid project (expected version 1)");
    }
    return new BoardEngine(data.state, DEFAULT_FOOTPRINTS.concat(data.footprints ?? []));
  }
}

export interface SerializedProject {
  version: 1;
  state: BoardState;
  footprints: Footprint[];
}
