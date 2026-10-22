/**
 * Segment-intersection geometry for crossing detection.
 *
 * Bare bottom-copper wires that physically cross (or share a pad) between two
 * different nets would short on a real perfboard. We test the straight segments
 * between consecutive holes of each trace. Insulated jumper wires are exempt.
 */

import type { HoleCoord } from "./types";

function orient(a: HoleCoord, b: HoleCoord, c: HoleCoord): number {
  return Math.sign((b.col - a.col) * (c.row - a.row) - (b.row - a.row) * (c.col - a.col));
}

function onSeg(a: HoleCoord, b: HoleCoord, p: HoleCoord): boolean {
  return (
    Math.min(a.col, b.col) <= p.col &&
    p.col <= Math.max(a.col, b.col) &&
    Math.min(a.row, b.row) <= p.row &&
    p.row <= Math.max(a.row, b.row)
  );
}

/** True if segments p1p2 and p3p4 intersect, including touching endpoints and overlap. */
export function segmentsIntersect(p1: HoleCoord, p2: HoleCoord, p3: HoleCoord, p4: HoleCoord): boolean {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p2, p3)) return true;
  if (o2 === 0 && onSeg(p1, p2, p4)) return true;
  if (o3 === 0 && onSeg(p3, p4, p1)) return true;
  if (o4 === 0 && onSeg(p3, p4, p2)) return true;
  return false;
}

/** True if any segment of path A touches/crosses any segment of path B. */
export function pathsIntersect(a: HoleCoord[], b: HoleCoord[]): boolean {
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

/**
 * True only if two segments PROPERLY cross — each straddles the other, so they
 * meet strictly between their holes. Touching at a shared hole or overlapping
 * along a line does NOT count (those are solder junctions, not shorts).
 */
function segmentsProperlyCross(p1: HoleCoord, p2: HoleCoord, p3: HoleCoord, p4: HoleCoord): boolean {
  const o1 = Math.sign((p2.col - p1.col) * (p3.row - p1.row) - (p2.row - p1.row) * (p3.col - p1.col));
  const o2 = Math.sign((p2.col - p1.col) * (p4.row - p1.row) - (p2.row - p1.row) * (p4.col - p1.col));
  const o3 = Math.sign((p4.col - p3.col) * (p1.row - p3.row) - (p4.row - p3.row) * (p1.col - p3.col));
  const o4 = Math.sign((p4.col - p3.col) * (p2.row - p3.row) - (p4.row - p3.row) * (p2.col - p3.col));
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** True if path A properly crosses path B between holes (not just meeting at a hole). */
export function pathsProperlyCross(a: HoleCoord[], b: HoleCoord[]): boolean {
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      if (segmentsProperlyCross(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}
