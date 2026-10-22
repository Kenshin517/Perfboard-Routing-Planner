import { describe, it, expect } from "vitest";
import { createBoard } from "./BoardEngine";

describe("BoardEngine — component placement", () => {
  it("adds a component and resolves its pins at rotation 0", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    const id = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 2, row: 3 } });
    expect(b.getComponents()).toHaveLength(1);

    const pins = b.pinPositions(id);
    const byNum = Object.fromEntries(pins.map((p) => [p.pin, p.coord]));
    // DIP-8: pin1 at anchor, pin5 diagonally opposite (3 cols right, 3 rows down).
    expect(byNum["1"]).toEqual({ col: 2, row: 3 });
    expect(byNum["4"]).toEqual({ col: 2, row: 6 });
    expect(byNum["5"]).toEqual({ col: 5, row: 6 });
    expect(byNum["8"]).toEqual({ col: 5, row: 3 });
    pins.forEach((p) => expect(p.ref).toBe("U1"));
  });

  it("rotates pin positions clockwise", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    const id = b.addComponent({ footprint: "PINHDR_1x4", ref: "J1", anchor: { col: 5, row: 5 } });
    // Rotation 0: pins run along +col (5,5),(6,5),(7,5),(8,5)
    expect(b.pinPositions(id).map((p) => p.coord)).toEqual([
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
      { col: 8, row: 5 },
    ]);
    // Rotation 90 CW (y-down): +col offset -> +row, so pins run downward.
    b.rotateComponent(id, 90);
    expect(b.pinPositions(id).map((p) => p.coord)).toEqual([
      { col: 5, row: 5 },
      { col: 5, row: 6 },
      { col: 5, row: 7 },
      { col: 5, row: 8 },
    ]);
  });

  it("rotateBy90 wraps through 360", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    const id = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 5, row: 5 }, rotation: 270 });
    b.rotateBy90(id);
    expect(b.getComponent(id)!.rotation).toBe(0);
  });

  it("moves and removes components", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    const id = b.addComponent({ footprint: "R_AXIAL_0.4", ref: "R1", anchor: { col: 0, row: 0 } });
    b.moveComponent(id, { col: 10, row: 10 });
    expect(b.getComponent(id)!.anchor).toEqual({ col: 10, row: 10 });
    b.removeComponent(id);
    expect(b.getComponents()).toHaveLength(0);
    expect(() => b.removeComponent(id)).toThrow();
  });

  it("detects whether a component fits on the board", () => {
    const b = createBoard({ cols: 6, rows: 6 });
    const ok = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 0, row: 0 } });
    expect(b.componentFits(ok)).toBe(true);
    const off = b.addComponent({ footprint: "DIP-8", ref: "U2", anchor: { col: 5, row: 5 } });
    expect(b.componentFits(off)).toBe(false);
  });

  it("rejects unknown footprints but accepts registered custom ones", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    expect(() => b.addComponent({ footprint: "MYSTERY", ref: "X1", anchor: { col: 0, row: 0 } })).toThrow();
    b.registerFootprint({ name: "MYSTERY", pins: [{ num: "1", col: 0, row: 0 }], body: { w: 1, h: 1 } });
    const id = b.addComponent({ footprint: "MYSTERY", ref: "X1", anchor: { col: 0, row: 0 } });
    expect(b.pinPositions(id)).toHaveLength(1);
  });

  it("gives each component a distinct id", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    const a = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 0, row: 0 } });
    const c = b.addComponent({ footprint: "DIP-8", ref: "U2", anchor: { col: 8, row: 0 } });
    expect(a).not.toBe(c);
  });
});
