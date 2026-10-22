import { describe, it, expect } from "vitest";
import { createBoard, BoardEngine } from "./BoardEngine";

/** Place N single-pin pads at given coords with refs P1..PN. */
function pads(b: BoardEngine, coords: { col: number; row: number }[]) {
  b.registerFootprint({ name: "PIN1", pins: [{ num: "1", col: 0, row: 0 }], body: { w: 1, h: 1 } });
  coords.forEach((c, i) => b.addComponent({ footprint: "PIN1", ref: `P${i + 1}`, anchor: c }));
}

describe("autoroute", () => {
  it("routes a simple net on bottom-copper, clearing all airwires", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    pads(b, [{ col: 2, row: 2 }, { col: 10, row: 2 }]);
    b.setNets([{ name: "SIG", pins: [{ ref: "P1", pin: "1" }, { ref: "P2", pin: "1" }] }]);

    expect(b.ratsnest()).toHaveLength(1);
    const res = b.autoroute();

    expect(b.ratsnest()).toHaveLength(0); // fully connected
    expect(res.bottom).toBe(1);
    expect(res.jumper).toBe(0);
    expect(b.counts().bottomCrossings).toBe(0);
  });

  it("uses a jumper when two required connections must cross", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    // Two nets whose links form an X: A = (0,0)-(6,6), B = (0,6)-(6,0).
    pads(b, [
      { col: 0, row: 0 },
      { col: 6, row: 6 },
      { col: 0, row: 6 },
      { col: 6, row: 0 },
    ]);
    b.setNets([
      { name: "A", pins: [{ ref: "P1", pin: "1" }, { ref: "P2", pin: "1" }] },
      { name: "B", pins: [{ ref: "P3", pin: "1" }, { ref: "P4", pin: "1" }] },
    ]);

    const res = b.autoroute();
    expect(b.ratsnest()).toHaveLength(0); // both nets connected
    expect(b.counts().bottomCrossings).toBe(0); // no bare crossing remains
    expect(res.jumper + b.counts().jumpers).toBeGreaterThanOrEqual(1); // at least one went to jumper
  });

  it("is idempotent — a second pass adds nothing", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    pads(b, [{ col: 1, row: 1 }, { col: 8, row: 5 }, { col: 3, row: 9 }]);
    b.setNets([{ name: "N", pins: [{ ref: "P1", pin: "1" }, { ref: "P2", pin: "1" }, { ref: "P3", pin: "1" }] }]);
    b.autoroute();
    const before = b.getTraces().length;
    const res2 = b.autoroute();
    expect(res2).toEqual({ bottom: 0, jumper: 0 });
    expect(b.getTraces().length).toBe(before);
  });
});
