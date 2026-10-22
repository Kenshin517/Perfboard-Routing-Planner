/**
 * Shared display geometry for the 2D renderers (canvas + PNG). Keeps the
 * flip/mirror formula and the component-rectangle math in one place so the
 * canvas and PNG can't drift apart (they did before this).
 */

/** Column index as displayed: mirrored horizontally when viewing the solder side. */
export function mirrorCol(col: number, cols: number, flipped: boolean): number {
  return flipped ? cols - 1 - col : col;
}

export interface Bounds {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

/** Inclusive grid bounding box of a set of coords. Single source for the bbox formula. */
export function boundsOf(coords: { col: number; row: number }[]): Bounds {
  const cs = coords.map((c) => c.col), rs = coords.map((c) => c.row);
  return { minC: Math.min(...cs), maxC: Math.max(...cs), minR: Math.min(...rs), maxR: Math.max(...rs) };
}

/**
 * Screen rectangle for a component body, computed from both corners so it's
 * correct whether or not the view is mirrored. `sx`/`sy` map grid -> pixels
 * (already flip-aware); `padPx` is the inflation around the pins in pixels.
 */
export function screenRectFromBounds(
  b: Bounds,
  sx: (c: number) => number,
  sy: (r: number) => number,
  padPx: number,
): { x: number; y: number; w: number; h: number } {
  const x1 = sx(b.minC), x2 = sx(b.maxC);
  const y1 = sy(b.minR), y2 = sy(b.maxR);
  return {
    x: Math.min(x1, x2) - padPx,
    y: Math.min(y1, y2) - padPx,
    w: Math.abs(x2 - x1) + padPx * 2,
    h: Math.abs(y2 - y1) + padPx * 2,
  };
}
