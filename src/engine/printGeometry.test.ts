import { describe, it, expect } from "vitest";
import { holeMm, boardSpanMm, pageSizeMm, type PrintLayout } from "./printGeometry";

const base: PrintLayout = { cols: 10, rows: 8, pitchMm: 2.54, marginMm: 10, mirror: false };

describe("print geometry (mm, must be exact for 1:1)", () => {
  it("places holes at exact pitch offsets from the margin", () => {
    expect(holeMm({ col: 0, row: 0 }, base)).toEqual({ x: 10, y: 10 });
    expect(holeMm({ col: 1, row: 0 }, base)).toEqual({ x: 10 + 2.54, y: 10 });
    expect(holeMm({ col: 0, row: 3 }, base)).toEqual({ x: 10, y: 10 + 3 * 2.54 });
  });

  it("mirrors horizontally for the routing (solder-side) guide", () => {
    const m: PrintLayout = { ...base, mirror: true };
    // col 0 ends up on the far right; col (cols-1) ends up at the margin
    expect(holeMm({ col: 0, row: 0 }, m).x).toBeCloseTo(10 + 9 * 2.54);
    expect(holeMm({ col: 9, row: 0 }, m).x).toBeCloseTo(10);
    expect(holeMm({ col: 0, row: 0 }, m).y).toBe(10); // rows never mirror
  });

  it("computes board span and page size", () => {
    expect(boardSpanMm(base)).toEqual({ w: 9 * 2.54, h: 7 * 2.54 });
    const page = pageSizeMm(base, 50);
    expect(page.w).toBeCloseTo(50 + 20); // calibration (50) wider than board span here
    expect(page.h).toBeCloseTo(7 * 2.54 + 20 + 14);
  });
});
