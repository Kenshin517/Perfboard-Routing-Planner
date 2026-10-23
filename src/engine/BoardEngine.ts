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
  MountingHole,
  Net,
  PinDef,
  PlacedComponent,
  Rotation,
  Trace,
} from "./types";
import { coordToLabel } from "./coordinates";
import { boundsOf, type Bounds } from "@/lib/display";
import { DEFAULT_FOOTPRINTS, makeGenericFootprint, rotateOffset } from "./footprints";
import { mapKicadFootprint, type ParsedNetlist } from "./netlist";
import { findPath } from "./router";
import { pathsIntersect, pathsProperlyCross } from "./crossings";

export interface RouteOptions {
  layer?: Layer;
  /** Extra blocked cells for the pathfinder (e.g. existing bare traces). */
  isBlocked?: (c: HoleCoord) => boolean;
  /**
   * Allow diagonal steps. Defaults by layer: bottom-copper is orthogonal only
   * (realistic solder bridges run along grid rows/columns), jumper allows
   * diagonal (insulated wire can go any direction).
   */
  allowDiagonal?: boolean;
}

/** Bare copper follows the grid (no diagonals); jumpers may go diagonal. */
function diagonalForLayer(layer: Layer | undefined, override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return layer === "jumper";
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
  /** Mounting-hole centres; or "corners" for the standard 4 corner holes. */
  mounting?: MountingHole[] | "corners";
}

/**
 * The 4 corner mounting holes of a real perfboard: each sits in the middle of
 * the 2x2 pad cluster at a corner (e.g. between A1/B1/A2/B2), making those pads
 * unusable.
 */
export function cornerMountingHoles(cols: number, rows: number): MountingHole[] {
  return [
    { col: 0.5, row: 0.5 },
    { col: cols - 1.5, row: 0.5 },
    { col: 0.5, row: rows - 1.5 },
    { col: cols - 1.5, row: rows - 1.5 },
  ];
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
  /** Defaults to true. Netlist import passes false (part lands in the tray). */
  placed?: boolean;
}

/** Factory: build a fresh board. */
export function createBoard(opts: CreateBoardOptions): BoardEngine {
  const mounting = opts.mounting === "corners" ? cornerMountingHoles(opts.cols, opts.rows) : opts.mounting;
  return new BoardEngine({
    config: {
      cols: opts.cols,
      rows: opts.rows,
      pitchMm: opts.pitchMm ?? DEFAULT_PITCH_MM,
      ...(mounting ? { mounting } : {}),
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
      components: state.components ? state.components.map((c) => ({ ...c, placed: c.placed ?? true })) : [],
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
    const hadCornerMounts = this.state.config.mounting !== undefined;
    this.state.config.cols = cols;
    this.state.config.rows = rows;
    // Keep corner mounting holes pinned to the (new) corners.
    if (hadCornerMounts) this.state.config.mounting = cornerMountingHoles(cols, rows);
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

  /** Mounting-hole centres (empty when the board has none). */
  getMountingHoles(): MountingHole[] {
    return (this.state.config.mounting ?? []).map((m) => ({ ...m }));
  }

  /** True if this integer hole is consumed by a mounting hole (unusable). */
  isMountingBlocked(col: number, row: number): boolean {
    for (const m of this.state.config.mounting ?? []) {
      // A centre at x.5 blocks the two integer holes it sits between on each axis.
      if (Math.abs(col - m.col) <= 0.5 && Math.abs(row - m.row) <= 0.5) return true;
    }
    return false;
  }

  /** A real hole that isn't taken by a mounting hole — where parts/traces can go. */
  hasUsableHole(col: number, row: number): boolean {
    return this.hasHole(col, row) && !this.isMountingBlocked(col, row);
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
      placed: input.placed ?? true,
    });
    return id;
  }

  getComponents(): PlacedComponent[] {
    return this.state.components.map((c) => ({ ...c }));
  }

  /** Components actually on the board (what every renderer and the router use). */
  getPlacedComponents(): PlacedComponent[] {
    return this.state.components.filter((c) => c.placed).map((c) => ({ ...c }));
  }

  /** Imported-but-not-yet-placed components (shown in the tray). */
  getUnplacedComponents(): PlacedComponent[] {
    return this.state.components.filter((c) => !c.placed).map((c) => ({ ...c }));
  }

  /** Drop an unplaced (or placed) component onto the board at an anchor. */
  place(id: string, anchor: HoleCoord): void {
    const c = this.mustComponent(id);
    c.anchor = { ...anchor };
    c.placed = true;
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

  /** Rename a component's reference designator. */
  setComponentRef(id: string, ref: string): void {
    this.mustComponent(id).ref = ref;
  }

  /** Set a component's value (e.g. "10k", "NE555"). */
  setComponentValue(id: string, value: string): void {
    this.mustComponent(id).value = value;
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
    return this.pinPositions(id).every((p) => this.hasUsableHole(p.coord.col, p.coord.row));
  }

  /** Grid bounding box (inclusive) of a component's pins. Shared by every renderer. */
  componentBounds(id: string): Bounds {
    return boundsOf(this.pinPositions(id).map((p) => p.coord));
  }

  /** Every pin of every PLACED component, resolved to absolute positions. */
  allPins(): ResolvedPin[] {
    return this.state.components.filter((c) => c.placed).flatMap((c) => this.pinPositions(c.id));
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
      // Imported parts are NOT auto-placed (spec: placement manual). They land
      // in the tray; the user drops them. anchor here is just a placeholder.
      this.addComponent({ footprint: fpName, ref: comp.ref, value: comp.value, anchor: { col: 0, row: 0 }, placed: false });
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

    // Net each pin belongs to (undefined if on no net).
    const netOf = pins.map(
      (p) => this.state.nets.find((n) => n.pins.some((x) => x.ref === p.ref && x.pin === p.pin))?.name,
    );
    const sameNet = (i: number, j: number) => netOf[i] === netOf[j];

    const uf = new UnionFind(pins.length);
    // Pins sharing a hole are connected only if they're on the same net; two
    // different nets on one pad is a short (flagged elsewhere), not connectivity.
    for (const arr of byCoord.values())
      for (let i = 1; i < arr.length; i++) if (sameNet(arr[0], arr[i])) uf.union(arr[0], arr[i]);
    // Pins joined by an existing trace: only pins of that trace's own net (a bare
    // trace crossing a foreign pad is a short, not an intended connection).
    for (const t of this.state.traces) {
      const onPath = new Set(t.path.map(key));
      const hit = pins
        .map((p, i) => (onPath.has(key(p.coord)) ? i : -1))
        .filter((i) => i >= 0 && (t.net === undefined || netOf[i] === t.net));
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

  /** Board holes of every placed pad on the given net (the route's destinations). */
  padsOfNet(net: string): HoleCoord[] {
    const netOf = this.pinNetMap();
    return this.allPins()
      .filter((p) => netOf.get(`${p.ref}/${p.pin}`) === net)
      .map((p) => ({ ...p.coord }));
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
   * Compute (but DON'T commit) the A* path between two holes, with the net it
   * would carry. Used to show a proposed route the user can approve. Null if no
   * path exists.
   */
  previewRoute(a: HoleCoord, b: HoleCoord, opts: RouteOptions = {}): { path: HoleCoord[]; net?: string } | null {
    const routeNet = this.netAt(a) ?? this.netAt(b);
    const foreign = this.foreignPadHoles(routeNet);
    const key = (c: HoleCoord) => `${c.col},${c.row}`;
    const path = findPath(a, b, {
      cols: this.cols,
      rows: this.rows,
      allowDiagonal: diagonalForLayer(opts.layer ?? "bottom-copper", opts.allowDiagonal),
      // A bare wire can't run through another component's pad (it would short),
      // nor through a mounting hole. Start/goal are exempt in findPath, so
      // routing INTO a pad still works.
      isBlocked: (c) =>
        foreign.has(key(c)) || this.isMountingBlocked(c.col, c.row) || (opts.isBlocked?.(c) ?? false),
    });
    if (!path) return null;
    const na = this.netAt(a), nb = this.netAt(b);
    return { path, net: na && na === nb ? na : undefined };
  }

  /**
   * Route a path through a sequence of waypoints (bottom-copper, grid-following),
   * stitching an A* path between each consecutive pair. Used by free-draw so the
   * wire follows the grid instead of cutting straight across. No commit; null if
   * any segment can't be routed.
   */
  routeWaypoints(points: HoleCoord[], opts: RouteOptions = {}): { path: HoleCoord[]; net?: string } | null {
    if (points.length < 2) return null;
    const full: HoleCoord[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const seg = this.previewRoute(points[i], points[i + 1], opts);
      if (!seg) return null;
      if (i === 0) full.push(...seg.path);
      else full.push(...seg.path.slice(1)); // drop the shared joint
    }
    const na = this.netAt(points[0]), nb = this.netAt(points[points.length - 1]);
    return { path: full, net: na && na === nb ? na : undefined };
  }

  /** Map of "ref/pin" -> net name, for quick net lookups. */
  private pinNetMap(): Map<string, string> {
    const m = new Map<string, string>();
    for (const n of this.state.nets) for (const p of n.pins) m.set(`${p.ref}/${p.pin}`, n.name);
    return m;
  }

  /** Holes occupied by pads NOT on the given net (obstacles for a bare route). */
  private foreignPadHoles(routeNet: string | undefined): Set<string> {
    const netOf = this.pinNetMap();
    const out = new Set<string>();
    for (const p of this.allPins()) {
      if (netOf.get(`${p.ref}/${p.pin}`) !== routeNet) out.add(`${p.coord.col},${p.coord.row}`);
    }
    return out;
  }

  /**
   * Route a connection between two holes with A*, add it as a trace.
   * The net is auto-detected when both ends belong to the same net.
   * Returns the trace id, or null if no path exists.
   */
  routePadToPad(a: HoleCoord, b: HoleCoord, opts: RouteOptions = {}): string | null {
    const preview = this.previewRoute(a, b, opts);
    if (!preview) return null;
    return this.addTrace(preview.path, { layer: opts.layer ?? "bottom-copper", net: preview.net });
  }

  removeTrace(id: string): void {
    const i = this.state.traces.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`removeTrace: no trace "${id}"`);
    this.state.traces.splice(i, 1);
  }

  /** Remove every trace (keeps components and nets). */
  clearTraces(): void {
    this.state.traces = [];
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
    const out: { a: string; b: string }[] = [];
    for (let i = 0; i < bare.length; i++) {
      for (let j = i + 1; j < bare.length; j++) {
        const ni = bare[i].net, nj = bare[j].net;
        if (ni !== undefined && ni === nj) continue; // same defined net = junction
        const bothDefined = ni !== undefined && nj !== undefined;
        // Two different NETS that touch anywhere is a short. Otherwise (at least
        // one unnamed manual wire) only a PROPER mid-cell crossing is a short;
        // meeting at a hole is a solder junction, not a crossing.
        const conflict = bothDefined
          ? pathsIntersect(bare[i].path, bare[j].path)
          : pathsProperlyCross(bare[i].path, bare[j].path);
        if (conflict) out.push({ a: bare[i].id, b: bare[j].id });
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

  // ---- autoroute ----

  /**
   * Greedy autoroute of all unrouted connections. Short links first; each tries
   * bottom-copper (avoiding other nets' pads and bare traces), and is promoted to
   * the jumper layer if no clear path exists or it would cross a bare trace.
   * A "helper" — not an optimal solver. Returns how many links were made.
   */
  autoroute(): { bottom: number; jumper: number } {
    const key = (c: HoleCoord) => `${c.col},${c.row}`;
    let bottom = 0, jumper = 0;

    for (let guard = 0; guard < 5000; guard++) {
      const rats = this.ratsnest();
      if (rats.length === 0) break;
      rats.sort(
        (x, y) =>
          Math.abs(x.a.col - x.b.col) + Math.abs(x.a.row - x.b.row) -
          (Math.abs(y.a.col - y.b.col) + Math.abs(y.a.row - y.b.row)),
      );
      const w = rats[0];

      // Holes to avoid for a bare bottom route: other nets' bare traces and pads.
      const blocked = new Set<string>();
      for (const t of this.state.traces) {
        if (t.layer === "bottom-copper" && (t.net ?? "") !== (w.net ?? "\0")) {
          for (const h of t.path) blocked.add(key(h));
        }
      }
      for (const p of this.allPins()) {
        const net = this.state.nets.find((n) => n.pins.some((x) => x.ref === p.ref && x.pin === p.pin))?.name;
        if ((net ?? "") !== (w.net ?? "\0")) blocked.add(key(p.coord));
      }

      const bottomPath = findPath(w.a, w.b, {
        cols: this.cols,
        rows: this.rows,
        allowDiagonal: false, // bare copper follows the grid
        isBlocked: (c) => blocked.has(key(c)) || this.isMountingBlocked(c.col, c.row),
      });

      if (bottomPath) {
        const id = this.addTrace(bottomPath, { layer: "bottom-copper", net: w.net });
        if (this.crossings().some((p) => p.a === id || p.b === id)) {
          this.setTraceLayer(id, "jumper");
          jumper++;
        } else {
          bottom++;
        }
      } else {
        // No clear bottom path — run a jumper (insulated, may cross/diagonal but
        // still can't pass through a mounting hole).
        const free = findPath(w.a, w.b, {
          cols: this.cols,
          rows: this.rows,
          allowDiagonal: true,
          isBlocked: (c) => this.isMountingBlocked(c.col, c.row),
        });
        if (!free) break; // genuinely unreachable; stop to avoid an infinite loop
        this.addTrace(free, { layer: "jumper", net: w.net });
        jumper++;
      }
    }
    return { bottom, jumper };
  }

  // ---- build-list ("resep rakit") ----

  /** Human-readable assembly guide: placement, connections, and a summary. */
  buildList(): string {
    const label = (c: HoleCoord) => coordToLabel(c);
    const natCmp = (a: string, b: string) =>
      a.replace(/\d+/g, (n) => n.padStart(6, "0")).localeCompare(b.replace(/\d+/g, (n) => n.padStart(6, "0")));

    const lines: string[] = [];
    lines.push("PLACEMENT");
    const comps = this.getPlacedComponents().sort((a, b) => natCmp(a.ref, b.ref));
    if (comps.length === 0) lines.push("  (belum ada komponen di board)");
    for (const c of comps) {
      const { minC, maxC, minR, maxR } = this.componentBounds(c.id);
      const range =
        minC === maxC && minR === maxR
          ? label({ col: minC, row: minR })
          : `${label({ col: minC, row: minR })}..${label({ col: maxC, row: maxR })}`;
      const rot = c.rotation ? ` @${c.rotation}°` : "";
      const val = c.value ? ` "${c.value}"` : "";
      const fit = this.componentFits(c.id) ? "" : "  [OFF-BOARD]";
      lines.push(`  ${c.ref} (${c.footprint})${val} -> ${range}${rot}${fit}`);
    }
    const unplaced = this.getUnplacedComponents();
    if (unplaced.length) lines.push(`  (${unplaced.length} belum ditaruh: ${unplaced.map((c) => c.ref).join(", ")})`);

    lines.push("");
    lines.push("CONNECTIONS");
    const crossing = new Set(this.crossings().flatMap((p) => [p.a, p.b]));
    const traces = this.getTraces();
    if (traces.length === 0) lines.push("  (belum ada jalur)");
    for (const t of traces) {
      const a = label(t.path[0]);
      const b = label(t.path[t.path.length - 1]);
      const word = t.layer === "jumper" ? "jumper" : "bridge";
      const via = t.path.length > 2 ? ` (${t.path.length} holes)` : "";
      const warn = crossing.has(t.id) ? "  [! CROSSING]" : "";
      lines.push(`  ${t.net ?? "(no net)"}: ${word} ${a}->${b}${via}${warn}`);
    }

    const c = this.counts();
    lines.push("");
    lines.push("SUMMARY");
    lines.push(`  ${c.traces} trace (${c.jumpers} jumper), ${c.bottomCrossings} crossing, ${this.ratsnest().length} airwire tersisa`);
    return lines.join("\n");
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
