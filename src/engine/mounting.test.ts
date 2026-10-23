import { describe, it, expect } from "vitest";
import { createBoard, cornerMountingHoles, BoardEngine } from "./BoardEngine";

describe("mounting holes", () => {
  it("the standard board has 4 corner mounting holes consuming the 2x2 corner clusters", () => {
    const b = createBoard({ cols: 25, rows: 29, mounting: "corners" });
    expect(b.getMountingHoles()).toHaveLength(4);
    // Top-left cluster A1/B1/A2/B2 (cols 0-1, rows 0-1) is blocked.
    for (const [c, r] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      expect(b.isMountingBlocked(c, r)).toBe(true);
      expect(b.hasUsableHole(c, r)).toBe(false);
    }
    // Other corners too (X=col23, Y=col24; rows 27,28).
    expect(b.isMountingBlocked(24, 28)).toBe(true); // Y29
    expect(b.isMountingBlocked(23, 27)).toBe(true); // X28
    // A hole in the middle is fine.
    expect(b.hasUsableHole(12, 14)).toBe(true);
    expect(b.isMountingBlocked(12, 14)).toBe(false);
  });

  it("a plain board (no mounting) has every hole usable", () => {
    const b = createBoard({ cols: 10, rows: 10 });
    expect(b.getMountingHoles()).toHaveLength(0);
    expect(b.hasUsableHole(0, 0)).toBe(true);
  });

  it("a component overlapping a mounting hole does not fit", () => {
    const b = createBoard({ cols: 25, rows: 29, mounting: "corners" });
    const id = b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 0, row: 0 } }); // overlaps corner
    expect(b.componentFits(id)).toBe(false);
    const ok = b.addComponent({ footprint: "DIP-8", ref: "U2", anchor: { col: 10, row: 10 } });
    expect(b.componentFits(ok)).toBe(true);
  });

  it("a bare route won't pass through a mounting hole", () => {
    const b = createBoard({ cols: 25, rows: 29, mounting: "corners" });
    // Route near the top-left corner from (0,2) to (2,0): the direct L would clip
    // the mounting cluster {0,1}x{0,1}; the path must avoid those holes.
    const pv = b.previewRoute({ col: 0, row: 3 }, { col: 3, row: 0 });
    expect(pv).not.toBeNull();
    for (const h of pv!.path) expect(b.isMountingBlocked(h.col, h.row)).toBe(false);
  });

  it("resize keeps corner mounting holes pinned to the new corners", () => {
    const b = createBoard({ cols: 25, rows: 29, mounting: "corners" });
    b.resize(10, 10);
    expect(b.getMountingHoles()).toEqual(cornerMountingHoles(10, 10));
    expect(b.isMountingBlocked(8, 8)).toBe(true); // new bottom-right cluster
  });

  it("mounting config survives serialization", () => {
    const b = createBoard({ cols: 25, rows: 29, mounting: "corners" });
    const back = BoardEngine.fromSerialized(JSON.parse(JSON.stringify(b.serialize())));
    expect(back.getMountingHoles()).toHaveLength(4);
    expect(back.isMountingBlocked(0, 0)).toBe(true);
  });
});
