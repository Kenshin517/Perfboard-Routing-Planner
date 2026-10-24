/**
 * Domain types and helpers for the Schematic Sheet Editor (EasyEDA style).
 */

export type SymbolType =
  | "resistor"
  | "capacitor"
  | "diode"
  | "ic8"
  | "ic14"
  | "header2"
  | "header4"
  | "to220"
  | "esp32"
  | "vcc"
  | "gnd";

export interface SchematicPinDef {
  num: string;
  name: string;
  x: number; // offset relative to symbol origin
  y: number; // offset relative to symbol origin
}

export interface SchematicComponent {
  id: string;
  ref: string;
  value: string;
  footprint: string;
  symbolType: SymbolType;
  x: number; // canvas x (grid units or px)
  y: number; // canvas y (grid units or px)
  rotation: 0 | 90 | 180 | 270;
}

export interface SchematicWire {
  id: string;
  netName?: string;
  from: { compRef: string; pin: string; x: number; y: number };
  to: { compRef: string; pin: string; x: number; y: number };
  waypoints?: { x: number; y: number }[];
}

export interface SchematicTitleBlock {
  projectName: string;
  boardName: string;
  schematicName: string;
  page: string;
  drawn: string;
  reviewed: string;
  createDate: string;
  updateDate: string;
  version: string;
  size: string;
}

export interface SchematicSheetData {
  titleBlock: SchematicTitleBlock;
  components: SchematicComponent[];
  wires: SchematicWire[];
}

/** Get pin definitions for a given symbol type */
export function getSymbolPins(type: SymbolType): SchematicPinDef[] {
  switch (type) {
    case "resistor":
    case "capacitor":
    case "diode":
      return [
        { num: "1", name: "1", x: -30, y: 0 },
        { num: "2", name: "2", x: 30, y: 0 },
      ];
    case "header2":
      return [
        { num: "1", name: "1", x: 25, y: -10 },
        { num: "2", name: "2", x: 25, y: 10 },
      ];
    case "header4":
      return [
        { num: "1", name: "1", x: 25, y: -30 },
        { num: "2", name: "2", x: 25, y: -10 },
        { num: "3", name: "3", x: 25, y: 10 },
        { num: "4", name: "4", x: 25, y: 30 },
      ];
    case "to220":
      return [
        { num: "1", name: "IN", x: -25, y: 0 },
        { num: "2", name: "OUT", x: 25, y: 0 },
        { num: "3", name: "ADJ", x: 0, y: 25 },
      ];
    case "ic8":
      return [
        // Left pins (1..4)
        { num: "1", name: "1", x: -35, y: -30 },
        { num: "2", name: "2", x: -35, y: -10 },
        { num: "3", name: "3", x: -35, y: 10 },
        { num: "4", name: "4", x: -35, y: 30 },
        // Right pins (8..5)
        { num: "8", name: "8", x: 35, y: -30 },
        { num: "7", name: "7", x: 35, y: -10 },
        { num: "6", name: "6", x: 35, y: 10 },
        { num: "5", name: "5", x: 35, y: 30 },
      ];
    case "ic14":
      return [
        { num: "1", name: "1", x: -35, y: -60 },
        { num: "2", name: "2", x: -35, y: -40 },
        { num: "3", name: "3", x: -35, y: -20 },
        { num: "4", name: "4", x: -35, y: 0 },
        { num: "5", name: "5", x: -35, y: 20 },
        { num: "6", name: "6", x: -35, y: 40 },
        { num: "7", name: "7", x: -35, y: 60 },
        { num: "14", name: "14", x: 35, y: -60 },
        { num: "13", name: "13", x: 35, y: -40 },
        { num: "12", name: "12", x: 35, y: -20 },
        { num: "11", name: "11", x: 35, y: 0 },
        { num: "10", name: "10", x: 35, y: 20 },
        { num: "9", name: "9", x: 35, y: 40 },
        { num: "8", name: "8", x: 35, y: 60 },
      ];
    case "esp32":
      return [
        { num: "1", name: "3V3", x: -45, y: -40 },
        { num: "2", name: "GND", x: -45, y: -20 },
        { num: "3", name: "D15", x: -45, y: 0 },
        { num: "4", name: "D2", x: -45, y: 20 },
        { num: "5", name: "D4", x: -45, y: 40 },
        { num: "6", name: "TX", x: 45, y: -40 },
        { num: "7", name: "RX", x: 45, y: -20 },
        { num: "8", name: "SDA", x: 45, y: 0 },
        { num: "9", name: "SCL", x: 45, y: 20 },
        { num: "10", name: "5V", x: 45, y: 40 },
      ];
    case "vcc":
      return [{ num: "1", name: "VCC", x: 0, y: 15 }];
    case "gnd":
      return [{ num: "1", name: "GND", x: 0, y: -15 }];
    default:
      return [
        { num: "1", name: "1", x: -20, y: 0 },
        { num: "2", name: "2", x: 20, y: 0 },
      ];
  }
}

/** Map footprint string to symbol type */
export function footprintToSymbolType(footprint: string): SymbolType {
  if (footprint.startsWith("R_")) return "resistor";
  if (footprint.startsWith("C_")) return "capacitor";
  if (footprint.startsWith("DIODE_")) return "diode";
  if (footprint === "DIP-8") return "ic8";
  if (footprint === "DIP-14") return "ic14";
  if (footprint === "PINHDR_1x2" || footprint === "SCREW_2") return "header2";
  if (footprint === "PINHDR_1x4") return "header4";
  if (footprint === "TO-220") return "to220";
  if (footprint === "ESP32_DEVKIT") return "esp32";
  return "ic8";
}

/** Map symbol type to default footprint string */
export function symbolTypeToFootprint(type: SymbolType): string {
  switch (type) {
    case "resistor":
      return "R_AXIAL_0.4";
    case "capacitor":
      return "C_DISC_0.2";
    case "diode":
      return "DIODE_0.4";
    case "ic8":
      return "DIP-8";
    case "ic14":
      return "DIP-14";
    case "header2":
      return "PINHDR_1x2";
    case "header4":
      return "PINHDR_1x4";
    case "to220":
      return "TO-220";
    case "esp32":
      return "ESP32_DEVKIT";
    default:
      return "PINHDR_1x2";
  }
}
