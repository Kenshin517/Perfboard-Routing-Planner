import { describe, it, expect } from "vitest";
import {
  colToLabel,
  labelToCol,
  rowToLabel,
  labelToRow,
  coordToLabel,
  labelToCoord,
} from "./coordinates";

describe("column labels (bijective base-26)", () => {
  it("maps 0-based index to spreadsheet-style letters", () => {
    expect(colToLabel(0)).toBe("A");
    expect(colToLabel(1)).toBe("B");
    expect(colToLabel(19)).toBe("T"); // matches the 20-col board in the spec photo
    expect(colToLabel(25)).toBe("Z");
    expect(colToLabel(26)).toBe("AA");
    expect(colToLabel(27)).toBe("AB");
    expect(colToLabel(51)).toBe("AZ");
    expect(colToLabel(52)).toBe("BA");
  });

  it("is invertible: labelToCol undoes colToLabel", () => {
    for (let c = 0; c < 1000; c++) {
      expect(labelToCol(colToLabel(c))).toBe(c);
    }
  });

  it("labelToCol is case-insensitive", () => {
    expect(labelToCol("aa")).toBe(26);
    expect(labelToCol("h")).toBe(7);
  });

  it("rejects bad input", () => {
    expect(() => colToLabel(-1)).toThrow();
    expect(() => colToLabel(1.5)).toThrow();
    expect(() => labelToCol("A1")).toThrow();
    expect(() => labelToCol("")).toThrow();
  });
});

describe("row labels (1-based numbers)", () => {
  it("maps 0-based index to 1-based number", () => {
    expect(rowToLabel(0)).toBe("1");
    expect(rowToLabel(19)).toBe("20");
  });

  it("is invertible", () => {
    for (let r = 0; r < 500; r++) {
      expect(labelToRow(rowToLabel(r))).toBe(r);
    }
  });

  it("rejects bad input", () => {
    expect(() => rowToLabel(-1)).toThrow();
    expect(() => labelToRow("0")).toThrow();
    expect(() => labelToRow("A")).toThrow();
  });
});

describe("full coordinate labels", () => {
  it("combines column + row", () => {
    expect(coordToLabel({ col: 0, row: 0 })).toBe("A1");
    expect(coordToLabel({ col: 1, row: 2 })).toBe("B3");
    expect(coordToLabel({ col: 7, row: 6 })).toBe("H7");
    expect(coordToLabel({ col: 19, row: 19 })).toBe("T20");
  });

  it("parses labels back to coords, case-insensitive", () => {
    expect(labelToCoord("A1")).toEqual({ col: 0, row: 0 });
    expect(labelToCoord("H7")).toEqual({ col: 7, row: 6 });
    expect(labelToCoord("b3")).toEqual({ col: 1, row: 2 });
    expect(labelToCoord("  T20 ")).toEqual({ col: 19, row: 19 });
  });

  it("round-trips coord -> label -> coord", () => {
    for (let col = 0; col < 30; col++) {
      for (let row = 0; row < 30; row++) {
        expect(labelToCoord(coordToLabel({ col, row }))).toEqual({ col, row });
      }
    }
  });

  it("rejects unparseable labels", () => {
    expect(() => labelToCoord("7H")).toThrow();
    expect(() => labelToCoord("H")).toThrow();
    expect(() => labelToCoord("12")).toThrow();
    expect(() => labelToCoord("")).toThrow();
  });
});
