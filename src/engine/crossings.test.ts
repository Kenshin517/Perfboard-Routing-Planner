import { describe, it, expect } from "vitest";
import { segmentsIntersect } from "./crossings";
import { createBoard } from "./BoardEngine";

describe("segment intersection", () => {
  it("detects a proper X crossing", () => {
    expect(segmentsIntersect({ col: 0, row: 0 }, { col: 4, row: 4 }, { col: 0, row: 4 }, { col: 4, row: 0 })).toBe(true);
  });
  it("detects a shared endpoint (shared pad)", () => {
    expect(segmentsIntersect({ col: 0, row: 0 }, { col: 0, row: 3 }, { col: 0, row: 3 }, { col: 3, row: 3 })).toBe(true);
  });
  it("ignores parallel non-touching segments", () => {
    expect(segmentsIntersect({ col: 0, row: 0 }, { col: 4, row: 0 }, { col: 0, row: 2 }, { col: 4, row: 2 })).toBe(false);
  });
});

describe("engine crossing detection", () => {
  function crossingBoard(netA: string, netB: string) {
    const b = createBoard({ cols: 10, rows: 10 });
    b.addTrace([{ col: 0, row: 0 }, { col: 4, row: 4 }], { net: netA });
    b.addTrace([{ col: 0, row: 4 }, { col: 4, row: 0 }], { net: netB });
    return b;
  }

  it("flags two different-net bare traces that cross", () => {
    const b = crossingBoard("A", "B");
    expect(b.crossings()).toHaveLength(1);
    expect(b.counts().bottomCrossings).toBe(1);
  });

  it("does not flag same-net traces that touch", () => {
    const b = crossingBoard("SAME", "SAME");
    expect(b.crossings()).toHaveLength(0);
  });

  it("treats unnamed wires meeting at a hole as a junction, not a crossing", () => {
    const b = createBoard({ cols: 10, rows: 10 });
    b.addTrace([{ col: 0, row: 0 }, { col: 3, row: 0 }]); // no net
    b.addTrace([{ col: 3, row: 0 }, { col: 3, row: 3 }]); // no net, meets the first at (3,0)
    expect(b.crossings()).toHaveLength(0); // chaining a wire is fine
  });

  it("still flags a proper mid-cell crossing of unnamed wires", () => {
    const b = createBoard({ cols: 10, rows: 10 });
    b.addTrace([{ col: 0, row: 0 }, { col: 4, row: 4 }]);
    b.addTrace([{ col: 0, row: 4 }, { col: 4, row: 0 }]); // crosses the first at (2,2), between holes
    expect(b.crossings()).toHaveLength(1);
  });

  it("flags two different NAMED nets that touch at a pad (real short)", () => {
    const b = createBoard({ cols: 10, rows: 10 });
    b.addTrace([{ col: 0, row: 0 }, { col: 3, row: 0 }], { net: "A" });
    b.addTrace([{ col: 3, row: 0 }, { col: 3, row: 3 }], { net: "B" }); // two nets on pad (3,0)
    expect(b.crossings()).toHaveLength(1);
  });

  it("clears the crossing when one trace moves to the jumper layer", () => {
    const b = crossingBoard("A", "B");
    const promoted = b.promoteCrossingsToJumper();
    expect(promoted).toBe(1);
    expect(b.crossings()).toHaveLength(0);
    expect(b.counts().jumpers).toBe(1);
    expect(b.counts().traces).toBe(2);
  });
});
