import { describe, it, expect } from "vitest";
import { parseKicadXmlNetlist, parseKicadNetNetlist, parseNetlist, mapKicadFootprint } from "./netlist";
import { createBoard } from "./BoardEngine";

const SAMPLE_NET = `(export (version "E")
  (components
    (comp (ref "U1") (value "NE555") (footprint "Package_DIP:DIP-8_W7.62mm"))
    (comp (ref "R1") (value "10k") (footprint "Resistor_THT:R_Axial_DIN0207"))
    (comp (ref "J1") (value "Conn_01x02") (footprint "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm")))
  (nets
    (net (code "1") (name "GND")
      (node (ref "U1") (pin "1"))
      (node (ref "R1") (pin "2"))
      (node (ref "J1") (pin "2")))
    (net (code "2") (name "VCC")
      (node (ref "U1") (pin "8"))
      (node (ref "J1") (pin "1")))))`;

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<export version="E">
  <components>
    <comp ref="U1"><value>NE555</value><footprint>Package_DIP:DIP-8_W7.62mm</footprint></comp>
    <comp ref="R1"><value>10k</value><footprint>Resistor_THT:R_Axial_DIN0207</footprint></comp>
    <comp ref="J1"><value>Conn_01x02</value><footprint>Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm</footprint></comp>
  </components>
  <nets>
    <net code="1" name="GND">
      <node ref="U1" pin="1"/>
      <node ref="R1" pin="2"/>
      <node ref="J1" pin="2"/>
    </net>
    <net code="2" name="VCC">
      <node ref="U1" pin="8"/>
      <node ref="J1" pin="1"/>
    </net>
  </nets>
</export>`;

describe("KiCad XML netlist parser", () => {
  it("extracts components and nets", () => {
    const p = parseKicadXmlNetlist(SAMPLE);
    expect(p.components).toHaveLength(3);
    expect(p.components[0]).toEqual({ ref: "U1", value: "NE555", footprint: "Package_DIP:DIP-8_W7.62mm" });
    expect(p.nets).toHaveLength(2);
    const gnd = p.nets.find((n) => n.name === "GND")!;
    expect(gnd.nodes).toHaveLength(3);
    expect(gnd.nodes).toContainEqual({ ref: "J1", pin: "2" });
  });

  it("rejects non-netlist input", () => {
    expect(() => parseKicadXmlNetlist("<html></html>")).toThrow();
  });
});

describe("KiCad .net (S-expression) parser", () => {
  it("extracts the same components and nets as the XML form", () => {
    const p = parseKicadNetNetlist(SAMPLE_NET);
    expect(p.components).toHaveLength(3);
    expect(p.components[0]).toEqual({ ref: "U1", value: "NE555", footprint: "Package_DIP:DIP-8_W7.62mm" });
    expect(p.nets).toHaveLength(2);
    const gnd = p.nets.find((n) => n.name === "GND")!;
    expect(gnd.nodes).toHaveLength(3);
    expect(gnd.nodes).toContainEqual({ ref: "J1", pin: "2" });
  });

  it("handles unquoted tokens (older KiCad)", () => {
    const src = `(export (version D)
      (components (comp (ref U1) (value NE555) (footprint Package_DIP:DIP-8_W7.62mm)))
      (nets (net (code 1) (name GND) (node (ref U1) (pin 1)))))`;
    const p = parseKicadNetNetlist(src);
    expect(p.components[0].ref).toBe("U1");
    expect(p.nets[0].nodes[0]).toEqual({ ref: "U1", pin: "1" });
  });

  it("rejects non-netlist S-expressions", () => {
    expect(() => parseKicadNetNetlist("(foo (bar))")).toThrow();
  });
});

describe("parseNetlist auto-detect", () => {
  it("picks the right parser by content", () => {
    expect(parseNetlist(SAMPLE).components).toHaveLength(3);
    expect(parseNetlist(SAMPLE_NET).components).toHaveLength(3);
    expect(() => parseNetlist("just some text")).toThrow();
  });
});

describe("footprint mapping", () => {
  it("maps common KiCad footprints to the library", () => {
    expect(mapKicadFootprint("Package_DIP:DIP-8_W7.62mm")).toBe("DIP-8");
    expect(mapKicadFootprint("Resistor_THT:R_Axial_DIN0207")).toBe("R_AXIAL_0.4");
    expect(mapKicadFootprint("Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm")).toBe("PINHDR_1x2");
    expect(mapKicadFootprint("Something:Unknown_Part")).toBeUndefined();
  });
});

describe("loadNetlist + ratsnest", () => {
  it("instantiates components, sets nets, and builds a ratsnest", () => {
    const b = createBoard({ cols: 40, rows: 20 });
    const res = b.loadNetlist(parseKicadXmlNetlist(SAMPLE));
    expect(res.added).toBe(3);
    expect(res.generic).toHaveLength(0); // all three mapped to the library
    expect(b.getComponents()).toHaveLength(3);
    expect(b.getNets()).toHaveLength(2);

    // Imported parts are NOT auto-placed: they sit in the tray, no airwires yet.
    expect(b.getUnplacedComponents()).toHaveLength(3);
    expect(b.ratsnest()).toHaveLength(0);

    // Once the user places them, the ratsnest appears.
    const ids = b.getComponents();
    b.place(ids[0].id, { col: 0, row: 0 });
    b.place(ids[1].id, { col: 0, row: 5 });
    b.place(ids[2].id, { col: 0, row: 10 });
    expect(b.getUnplacedComponents()).toHaveLength(0);

    // GND (3 pins) -> 2 airwires, VCC (2 pins) -> 1 airwire = 3 total.
    const rats = b.ratsnest();
    expect(rats).toHaveLength(3);
    expect(rats.filter((w) => w.net === "GND")).toHaveLength(2);
    expect(rats.filter((w) => w.net === "VCC")).toHaveLength(1);
  });

  it("falls back to a generic footprint using the netlist's own pin names", () => {
    const xml = `<export version="E">
      <components><comp ref="Q9"><value>?</value><footprint>Mystery:Thing</footprint></comp></components>
      <nets>
        <net code="1" name="N1"><node ref="Q9" pin="A"/><node ref="Q9" pin="C"/></net>
      </nets>
    </export>`;
    const b = createBoard({ cols: 20, rows: 20 });
    const res = b.loadNetlist(parseKicadXmlNetlist(xml));
    expect(res.generic).toContain("Q9");
    expect(b.getFootprint("GEN_Q9")!.pins.map((p) => p.num)).toEqual(["A", "C"]);
    // place it, then the same-component net with both pins -> 1 airwire
    b.place(b.getComponents()[0].id, { col: 5, row: 5 });
    expect(b.ratsnest()).toHaveLength(1);
  });
});
