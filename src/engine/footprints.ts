/**
 * Internal, curated footprint library — the hole pattern each common part
 * occupies on perfboard, in GRID-HOLE units (not mm). The netlist only says
 * "U1 is a DIP-8, pin 3 = GND"; this file is what tells the app that DIP-8
 * means 8 holes in a 2x4 pattern and which hole is pin 3.
 *
 * Offsets are relative to the component anchor at rotation 0.
 * Unknown parts fall back to a generic row of pads (see makeGenericFootprint).
 */

import type { Footprint, Rotation, HoleCoord, PinDef } from "./types";

/** DIP package: left column top->bottom, right column bottom->top (standard pin numbering). */
function dip(pinCount: number, name: string, widthHoles = 3): Footprint {
  const perSide = pinCount / 2;
  const pins: PinDef[] = [];
  for (let i = 0; i < perSide; i++) {
    pins.push({ num: String(i + 1), col: 0, row: i }); // left, down
  }
  for (let i = 0; i < perSide; i++) {
    pins.push({ num: String(perSide + i + 1), col: widthHoles, row: perSide - 1 - i }); // right, up
  }
  return { name, pins, body: { w: widthHoles + 1, h: perSide, height: 4 } };
}

/** A straight run of pins, 1 hole apart, along the column axis. */
function header(count: number, name: string): Footprint {
  const pins: PinDef[] = [];
  for (let i = 0; i < count; i++) pins.push({ num: String(i + 1), col: i, row: 0 });
  return { name, pins, body: { w: count, h: 1, height: 8 } };
}

/** A 2-lead axial part (resistor, diode, cap) with the given lead span in holes. */
function axial(spanHoles: number, name: string, heightMm = 2): Footprint {
  return {
    name,
    pins: [
      { num: "1", col: 0, row: 0 },
      { num: "2", col: spanHoles, row: 0 },
    ],
    body: { w: spanHoles + 1, h: 1, height: heightMm },
  };
}

export const DEFAULT_FOOTPRINTS: Footprint[] = [
  dip(8, "DIP-8"),
  dip(14, "DIP-14"),
  dip(16, "DIP-16"),
  axial(4, "R_AXIAL_0.4", 2), // resistor, 0.4" lead spacing
  axial(2, "C_DISC_0.2", 5), // disc capacitor, 0.2"
  axial(4, "DIODE_0.4", 2),
  header(2, "PINHDR_1x2"),
  header(4, "PINHDR_1x4"),
  {
    name: "TO-220",
    pins: [
      { num: "1", col: 0, row: 0 },
      { num: "2", col: 1, row: 0 },
      { num: "3", col: 2, row: 0 },
    ],
    body: { w: 3, h: 2, height: 10 },
  },
  {
    name: "SCREW_2",
    pins: [
      { num: "1", col: 0, row: 0 },
      { num: "2", col: 2, row: 0 }, // 5.08mm pitch = 2 holes
    ],
    body: { w: 3, h: 2, height: 10 },
  },
  // ESP32 devkit (approx): two 1x15 headers, rows ~0.9" apart.
  (() => {
    const pins: PinDef[] = [];
    for (let i = 0; i < 15; i++) pins.push({ num: String(i + 1), col: 0, row: i });
    for (let i = 0; i < 15; i++) pins.push({ num: String(16 + i), col: 9, row: 14 - i });
    return { name: "ESP32_DEVKIT", pins, body: { w: 10, h: 15, height: 13 } };
  })(),
];

/** Fallback for a part the library doesn't know: a plain row of N pads. */
export function makeGenericFootprint(name: string, pinCount: number): Footprint {
  return header(pinCount, name);
}

/** Rotate a grid offset about the origin by the given rotation (clockwise, screen coords y-down). */
export function rotateOffset(offset: { col: number; row: number }, rot: Rotation): HoleCoord {
  switch (rot) {
    case 0:
      return { col: offset.col, row: offset.row };
    case 90:
      return { col: -offset.row, row: offset.col };
    case 180:
      return { col: -offset.col, row: -offset.row };
    case 270:
      return { col: offset.row, row: -offset.col };
  }
}
