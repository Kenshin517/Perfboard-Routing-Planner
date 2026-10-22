import { describe, it, expect } from "vitest";
import { BoardEngine, createBoard, DEFAULT_PITCH_MM } from "./BoardEngine";

describe("BoardEngine — board skeleton", () => {
  it("creates a board with the given size", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    expect(b.cols).toBe(20);
    expect(b.rows).toBe(20);
    expect(b.holeCount()).toBe(400);
  });

  it("defaults pitch to 2.54mm", () => {
    const b = createBoard({ cols: 10, rows: 10 });
    expect(b.getConfig().pitchMm).toBe(DEFAULT_PITCH_MM);
  });

  it("honours a custom pitch", () => {
    const b = createBoard({ cols: 10, rows: 10, pitchMm: 2.0 });
    expect(b.getConfig().pitchMm).toBe(2.0);
  });

  it("enumerates every hole in row-major order", () => {
    const b = createBoard({ cols: 20, rows: 10 });
    const holes = b.getHoles();
    expect(holes).toHaveLength(200);
    expect(holes[0]).toEqual({ col: 0, row: 0 });
    expect(holes[1]).toEqual({ col: 1, row: 0 }); // row-major: col advances first
    expect(holes[20]).toEqual({ col: 0, row: 1 });
    expect(holes[holes.length - 1]).toEqual({ col: 19, row: 9 });
  });

  it("knows which holes are in bounds", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    expect(b.hasHole(0, 0)).toBe(true);
    expect(b.hasHole(19, 19)).toBe(true);
    expect(b.hasHole(20, 0)).toBe(false); // off the right edge
    expect(b.hasHole(0, 20)).toBe(false); // off the bottom edge
    expect(b.hasHole(-1, 0)).toBe(false);
    expect(b.hasHole(1.5, 0)).toBe(false);
  });

  it("labels holes like a perfboard (A1 top-left)", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    expect(b.labelAt({ col: 0, row: 0 })).toBe("A1");
    expect(b.labelAt({ col: 7, row: 6 })).toBe("H7");
    expect(b.labelAt({ col: 19, row: 19 })).toBe("T20");
  });

  it("refuses to label a hole outside the board", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    expect(() => b.labelAt({ col: 20, row: 0 })).toThrow();
  });

  it("getConfig returns a copy, not the internal state", () => {
    const b = createBoard({ cols: 5, rows: 5 });
    const cfg = b.getConfig();
    cfg.cols = 999;
    expect(b.cols).toBe(5); // mutating the copy must not affect the board
  });

  it("rejects invalid board sizes", () => {
    expect(() => createBoard({ cols: 0, rows: 10 })).toThrow();
    expect(() => createBoard({ cols: 10, rows: -1 })).toThrow();
    expect(() => createBoard({ cols: 10.5, rows: 10 })).toThrow();
    expect(() => createBoard({ cols: 10, rows: 10, pitchMm: 0 })).toThrow();
  });
});
