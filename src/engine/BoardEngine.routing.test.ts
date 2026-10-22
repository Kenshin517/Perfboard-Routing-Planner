import { describe, it, expect } from "vitest";
import { createBoard, BoardEngine } from "./BoardEngine";

function twoHeaderBoard() {
  const b = createBoard({ cols: 20, rows: 20 });
  b.addComponent({ footprint: "PINHDR_1x2", ref: "J1", anchor: { col: 0, row: 0 } }); // pins at (0,0),(1,0)
  b.addComponent({ footprint: "PINHDR_1x2", ref: "J2", anchor: { col: 0, row: 5 } }); // pins at (0,5),(1,5)
  b.setNets([{ name: "NET1", pins: [{ ref: "J1", pin: "1" }, { ref: "J2", pin: "1" }] }]);
  return b;
}

describe("manual routing", () => {
  it("routes pad-to-pad, auto-detecting the net, and clears the airwire", () => {
    const b = twoHeaderBoard();
    expect(b.ratsnest()).toHaveLength(1);

    const id = b.routePadToPad({ col: 0, row: 0 }, { col: 0, row: 5 });
    expect(id).not.toBeNull();

    const traces = b.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].net).toBe("NET1");
    expect(traces[0].layer).toBe("bottom-copper");
    expect(traces[0].path[0]).toEqual({ col: 0, row: 0 });
    expect(traces[0].path[traces[0].path.length - 1]).toEqual({ col: 0, row: 5 });

    // the connection is now physically made -> no airwire left
    expect(b.ratsnest()).toHaveLength(0);
  });

  it("validates and edits traces", () => {
    const b = twoHeaderBoard();
    expect(() => b.addTrace([{ col: 0, row: 0 }])).toThrow(); // too short
    expect(() => b.addTrace([{ col: 0, row: 0 }, { col: 99, row: 0 }])).toThrow(); // out of bounds

    const id = b.addTrace([{ col: 2, row: 2 }, { col: 3, row: 2 }]);
    b.setTraceLayer(id, "jumper");
    expect(b.getTraces()[0].layer).toBe("jumper");
    b.removeTrace(id);
    expect(b.getTraces()).toHaveLength(0);
  });

  it("survives serialization with traces", () => {
    const b = twoHeaderBoard();
    b.routePadToPad({ col: 0, row: 0 }, { col: 0, row: 5 });
    const back = BoardEngine.fromSerialized(JSON.parse(JSON.stringify(b.serialize())));
    expect(back.getTraces()).toHaveLength(1);
    expect(back.ratsnest()).toHaveLength(0);
  });
});
