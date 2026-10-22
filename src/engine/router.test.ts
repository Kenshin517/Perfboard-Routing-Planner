import { describe, it, expect } from "vitest";
import { findPath } from "./router";
import type { HoleCoord } from "./types";

describe("A* router", () => {
  it("finds a straight horizontal path", () => {
    const p = findPath({ col: 0, row: 0 }, { col: 4, row: 0 }, { cols: 10, rows: 10, allowDiagonal: false })!;
    expect(p[0]).toEqual({ col: 0, row: 0 });
    expect(p[p.length - 1]).toEqual({ col: 4, row: 0 });
    expect(p).toHaveLength(5);
  });

  it("uses diagonals when allowed (shorter path)", () => {
    const p = findPath({ col: 0, row: 0 }, { col: 3, row: 3 }, { cols: 10, rows: 10, allowDiagonal: true })!;
    expect(p).toHaveLength(4); // 3 diagonal steps
    expect(p[p.length - 1]).toEqual({ col: 3, row: 3 });
  });

  it("routes around blocked cells", () => {
    // Wall blocking column 2 for rows 0..8, leaving a gap at row 9.
    const blocked = (c: HoleCoord) => c.col === 2 && c.row <= 8;
    const p = findPath({ col: 0, row: 0 }, { col: 4, row: 0 }, {
      cols: 10,
      rows: 10,
      allowDiagonal: false,
      isBlocked: blocked,
    });
    expect(p).not.toBeNull();
    expect(p!.some((h) => h.col === 2 && h.row <= 8)).toBe(false); // never crosses the wall
    expect(p![p!.length - 1]).toEqual({ col: 4, row: 0 });
  });

  it("returns null when fully walled off", () => {
    const blocked = (c: HoleCoord) => c.col === 2; // full wall, no gap
    const p = findPath({ col: 0, row: 0 }, { col: 4, row: 0 }, {
      cols: 10,
      rows: 10,
      allowDiagonal: true,
      isBlocked: blocked,
    });
    expect(p).toBeNull();
  });

  it("treats start and goal as enterable even if marked blocked", () => {
    const blocked = () => true; // everything blocked except start/goal exemption
    const p = findPath({ col: 0, row: 0 }, { col: 1, row: 0 }, { cols: 5, rows: 5, isBlocked: blocked });
    expect(p).toEqual([{ col: 0, row: 0 }, { col: 1, row: 0 }]);
  });
});
