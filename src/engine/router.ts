/**
 * A* maze router on the hole grid. Pure and headless — reused by both manual
 * pad-to-pad routing (ticket 05) and autoroute (ticket 09).
 *
 * Movement is 8-directional by default (perfboard wires can run diagonally):
 * orthogonal step cost 1, diagonal cost sqrt(2). The heuristic is octile
 * distance, which is admissible for those costs.
 */

import type { HoleCoord } from "./types";

export interface PathOptions {
  cols: number;
  rows: number;
  /** A cell that cannot be entered (start/goal are always allowed). */
  isBlocked?: (c: HoleCoord) => boolean;
  /** Allow diagonal moves (default true). */
  allowDiagonal?: boolean;
}

const SQRT2 = Math.SQRT2;

class MinHeap {
  private a: { k: number; f: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, f: number) {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0].k;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l].f < a[s].f) s = l;
        if (r < a.length && a[r].f < a[s].f) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

/** Find a shortest path of holes from start to goal, or null if none exists. */
export function findPath(start: HoleCoord, goal: HoleCoord, opts: PathOptions): HoleCoord[] | null {
  const { cols, rows } = opts;
  const diag = opts.allowDiagonal ?? true;
  const inBounds = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const id = (c: number, r: number) => r * cols + c;
  const sid = id(start.col, start.row);
  const gid = id(goal.col, goal.row);
  if (!inBounds(start.col, start.row) || !inBounds(goal.col, goal.row)) return null;

  const h = (c: number, r: number) => {
    const dc = Math.abs(c - goal.col), dr = Math.abs(r - goal.row);
    return diag ? Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr) : dc + dr;
  };

  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new MinHeap();
  g.set(sid, 0);
  open.push(sid, h(start.col, start.row));

  const steps = diag
    ? [
        [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
        [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
      ]
    : [
        [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      ];

  while (open.size) {
    const cur = open.pop();
    if (cur === gid) {
      // reconstruct
      const path: HoleCoord[] = [];
      let n: number | undefined = cur;
      while (n !== undefined) {
        path.push({ col: n % cols, row: Math.floor(n / cols) });
        n = came.get(n);
      }
      return path.reverse();
    }
    const cc = cur % cols, cr = Math.floor(cur / cols);
    const gc = g.get(cur)!;
    for (const [dc, dr, cost] of steps) {
      const nc = cc + dc, nr = cr + dr;
      if (!inBounds(nc, nr)) continue;
      const nid = id(nc, nr);
      // start and goal are always enterable; other blocked cells are skipped
      if (nid !== gid && nid !== sid && opts.isBlocked?.({ col: nc, row: nr })) continue;
      const ng = gc + cost;
      if (ng < (g.get(nid) ?? Infinity)) {
        g.set(nid, ng);
        came.set(nid, cur);
        open.push(nid, ng + h(nc, nr));
      }
    }
  }
  return null;
}
