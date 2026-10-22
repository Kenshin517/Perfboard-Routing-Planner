import { describe, it, expect } from "vitest";
import { createBoard } from "./BoardEngine";

describe("build-list", () => {
  it("lists placement, connections and a summary", () => {
    const b = createBoard({ cols: 20, rows: 20 });
    b.addComponent({ footprint: "PINHDR_1x2", ref: "J1", anchor: { col: 0, row: 0 } });
    b.addComponent({ footprint: "PINHDR_1x2", ref: "J2", anchor: { col: 0, row: 5 } });
    b.setNets([{ name: "NET1", pins: [{ ref: "J1", pin: "1" }, { ref: "J2", pin: "1" }] }]);
    b.routePadToPad({ col: 0, row: 0 }, { col: 0, row: 5 });

    const text = b.buildList();
    expect(text).toContain("PLACEMENT");
    expect(text).toContain("J1 (PINHDR_1x2) -> A1..B1");
    expect(text).toContain("CONNECTIONS");
    expect(text).toContain("NET1: bridge A1->A6");
    expect(text).toContain("SUMMARY");
    expect(text).toMatch(/1 trace \(0 jumper\), 0 crossing, 0 airwire/);
  });

  it("marks off-board parts and jumper traces", () => {
    const b = createBoard({ cols: 4, rows: 4 });
    b.addComponent({ footprint: "DIP-8", ref: "U1", anchor: { col: 3, row: 3 } }); // off-board
    b.addTrace([{ col: 0, row: 0 }, { col: 2, row: 2 }], { layer: "jumper", net: "X" });
    const text = b.buildList();
    expect(text).toContain("[OFF-BOARD]");
    expect(text).toContain("X: jumper A1->C3");
  });
});
