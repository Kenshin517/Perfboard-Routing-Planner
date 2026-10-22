import { describe, it, expect } from "vitest";
import { BoardEngine, createBoard } from "./BoardEngine";

describe("serialisation round-trip", () => {
  it("preserves config, components, rotation and value", () => {
    const b = createBoard({ cols: 24, rows: 18, pitchMm: 2.54 });
    const u1 = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 3, row: 4 }, rotation: 90 });
    b.addComponent({ footprint: "R_AXIAL_0.4", ref: "R1", anchor: { col: 1, row: 1 }, value: "10k" });

    const json = JSON.stringify(b.serialize());
    const back = BoardEngine.fromSerialized(JSON.parse(json));

    expect(back.getConfig()).toEqual({ cols: 24, rows: 18, pitchMm: 2.54 });
    expect(back.getComponents()).toHaveLength(2);
    const u1b = back.getComponent(u1)!;
    expect(u1b.footprint).toBe("DIP-8");
    expect(u1b.rotation).toBe(90);
    expect(back.getComponents().find((c) => c.ref === "R1")!.value).toBe("10k");
    // pins still resolve identically
    expect(back.pinPositions(u1)).toEqual(b.pinPositions(u1));
  });

  it("keeps custom (registered) footprints across export/import", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    b.registerFootprint({ name: "WEIRD-3", pins: [{ num: "1", col: 0, row: 0 }, { num: "2", col: 2, row: 1 }, { num: "3", col: 4, row: 0 }], body: { w: 5, h: 2 } });
    const id = b.addComponent({ footprint: "WEIRD-3", ref: "X1", anchor: { col: 5, row: 5 } });

    const back = BoardEngine.fromSerialized(JSON.parse(JSON.stringify(b.serialize())));
    expect(back.getFootprint("WEIRD-3")).toBeDefined();
    expect(back.pinPositions(id)).toHaveLength(3);
  });

  it("continues id numbering after import (no collisions)", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 0, row: 0 } });
    const back = BoardEngine.fromSerialized(JSON.parse(JSON.stringify(b.serialize())));
    const newId = back.addComponent({ footprint: "DIP-8", ref: "U2", anchor: { col: 8, row: 0 } });
    const ids = back.getComponents().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain(newId);
  });

  it("rejects invalid snapshots", () => {
    expect(() => BoardEngine.fromSerialized({ version: 2 } as never)).toThrow();
    expect(() => BoardEngine.fromSerialized(null as never)).toThrow();
  });
});
