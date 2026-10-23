/**
 * Core domain types for the perfboard model.
 *
 * Units are HOLE-GRID integers everywhere in the engine (col, row),
 * never millimetres. Conversion to mm happens only at the export/print
 * layer. See the spec: "Model board & koordinat".
 */

/** A mounting-hole centre, in (possibly fractional) hole units. */
export interface MountingHole {
  col: number;
  row: number;
}

/** Physical configuration of a dot-perfboard. */
export interface BoardConfig {
  /** Number of hole columns (x), left to right. */
  cols: number;
  /** Number of hole rows (y), top to bottom. */
  rows: number;
  /** Centre-to-centre hole spacing in millimetres (classic perfboard = 2.54). */
  pitchMm: number;
  /**
   * Screw/mounting holes (non-plated). Each centre sits between pads and makes
   * the surrounding integer holes unusable (no component, no trace). Optional;
   * absent = plain board.
   */
  mounting?: MountingHole[];
}

/** A single hole position on the grid, 0-based. */
export interface HoleCoord {
  /** Column index, 0-based (0 = leftmost). */
  col: number;
  /** Row index, 0-based (0 = topmost). */
  row: number;
}

/** Allowed component rotations, in degrees clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

/** The two logical layers. bottom-copper = bare (no crossing); jumper = insulated (crossing ok). */
export type Layer = "bottom-copper" | "jumper";

/** One pin of a footprint: a grid offset from the component anchor + its pin number. */
export interface PinDef {
  /** Pin identifier as it appears in the netlist (kept as string: pins can be named). */
  num: string;
  /** Column offset from the component anchor, in holes (rotation 0). */
  col: number;
  /** Row offset from the component anchor, in holes (rotation 0). */
  row: number;
}

/** A reusable footprint: the physical hole pattern a part occupies. */
export interface Footprint {
  name: string;
  pins: PinDef[];
  /** Body bounding box in holes; height (mm) is used only by the 3D view. */
  body: { w: number; h: number; height?: number };
}

/** A component placed on the board. */
export interface PlacedComponent {
  id: string;
  /** Footprint name, resolved via the engine's footprint registry. */
  footprint: string;
  /** Reference designator, e.g. "U1", "R3". */
  ref: string;
  value?: string;
  /** Grid hole the footprint's (0,0) offset lands on (meaningful only when placed). */
  anchor: HoleCoord;
  rotation: Rotation;
  /**
   * Whether the component has been placed on the board. Imported-from-netlist
   * parts start false (manual placement is required — the spec keeps auto-
   * placement out of scope) and are shown in a tray until the user drops them.
   */
  placed: boolean;
}

/** A net from the imported netlist: a set of pins that must be connected. */
export interface Net {
  name: string;
  pins: { ref: string; pin: string }[];
}

/** A routed connection: an ordered path of holes on one layer. */
export interface Trace {
  id: string;
  layer: Layer;
  /** Net this trace belongs to, if any. */
  net?: string;
  /** Ordered sequence of holes the trace passes through (length >= 2). */
  path: HoleCoord[];
}

/** An unrouted connection hint between two pins of the same net. */
export interface Airwire {
  net: string;
  a: HoleCoord;
  b: HoleCoord;
}

/** Full serialisable state of a board. */
export interface BoardState {
  config: BoardConfig;
  components: PlacedComponent[];
  traces: Trace[];
  nets: Net[];
}
