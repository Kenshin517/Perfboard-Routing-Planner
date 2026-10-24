import type { SerializedProject } from "@/engine/BoardEngine";

export interface ProjectExample {
  id: string;
  name: string;
  filename: string;
  description: string;
  boardSize: string;
  cols: number;
  rows: number;
  project: SerializedProject;
}

export const EXAMPLES: ProjectExample[] = [
  {
    id: "555_blinker",
    name: "555 Timer LED Blinker",
    filename: "555_Blinker.pbrp",
    description: "Sirkuit astable multivibrator klasik menggunakan IC NE555, resistor timing, kapasitor, dan LED output.",
    boardSize: "5 × 7 cm (19×27 lubang)",
    cols: 19,
    rows: 27,
    project: {
      version: 1,
      state: {
        config: { cols: 19, rows: 27, pitchMm: 2.54 },
        components: [
          { id: "c1", footprint: "DIP-8", ref: "U1", anchor: { col: 7, row: 8 }, rotation: 0, placed: true },
          { id: "c2", footprint: "R_AXIAL_0.4", ref: "R1", anchor: { col: 3, row: 5 }, rotation: 0, placed: true },
          { id: "c3", footprint: "R_AXIAL_0.4", ref: "R2", anchor: { col: 3, row: 8 }, rotation: 0, placed: true },
          { id: "c4", footprint: "C_DISC_0.2", ref: "C1", anchor: { col: 12, row: 12 }, rotation: 0, placed: true },
          { id: "c5", footprint: "PINHDR_1x2", ref: "J1", anchor: { col: 2, row: 2 }, rotation: 0, placed: true },
          { id: "c6", footprint: "DIODE_0.4", ref: "D1", anchor: { col: 12, row: 7 }, rotation: 0, placed: true },
        ],
        traces: [],
        nets: [
          {
            name: "VCC",
            pins: [
              { ref: "U1", pin: "8" },
              { ref: "U1", pin: "4" },
              { ref: "R1", pin: "1" },
              { ref: "J1", pin: "1" },
            ],
          },
          {
            name: "GND",
            pins: [
              { ref: "U1", pin: "1" },
              { ref: "C1", pin: "2" },
              { ref: "J1", pin: "2" },
              { ref: "D1", pin: "2" },
            ],
          },
          {
            name: "DISCH",
            pins: [
              { ref: "U1", pin: "7" },
              { ref: "R1", pin: "2" },
              { ref: "R2", pin: "1" },
            ],
          },
          {
            name: "TRIG_THRES",
            pins: [
              { ref: "U1", pin: "2" },
              { ref: "U1", pin: "6" },
              { ref: "R2", pin: "2" },
              { ref: "C1", pin: "1" },
            ],
          },
          {
            name: "OUT",
            pins: [
              { ref: "U1", pin: "3" },
              { ref: "D1", pin: "1" },
            ],
          },
        ],
      },
      footprints: [],
    },
  },
  {
    id: "lm317_regulator",
    name: "LM317 Variable Power Supply",
    filename: "LM317_PowerSupply.pbrp",
    description: "Regulator tegangan linier dengan proteksi bypass capacitor dan screw terminal in/out.",
    boardSize: "7 × 9 cm (27×35 lubang)",
    cols: 27,
    rows: 35,
    project: {
      version: 1,
      state: {
        config: { cols: 27, rows: 35, pitchMm: 2.54 },
        components: [
          { id: "c1", footprint: "TO-220", ref: "U1", anchor: { col: 12, row: 14 }, rotation: 0, placed: true },
          { id: "c2", footprint: "SCREW_2", ref: "IN1", anchor: { col: 3, row: 14 }, rotation: 0, placed: true },
          { id: "c3", footprint: "SCREW_2", ref: "OUT1", anchor: { col: 21, row: 14 }, rotation: 0, placed: true },
          { id: "c4", footprint: "C_DISC_0.2", ref: "C_IN", anchor: { col: 8, row: 11 }, rotation: 0, placed: true },
          { id: "c5", footprint: "C_DISC_0.2", ref: "C_OUT", anchor: { col: 17, row: 11 }, rotation: 0, placed: true },
          { id: "c6", footprint: "R_AXIAL_0.4", ref: "R1", anchor: { col: 12, row: 20 }, rotation: 0, placed: true },
        ],
        traces: [],
        nets: [
          {
            name: "VIN",
            pins: [
              { ref: "IN1", pin: "1" },
              { ref: "U1", pin: "3" },
              { ref: "C_IN", pin: "1" },
            ],
          },
          {
            name: "VOUT",
            pins: [
              { ref: "U1", pin: "2" },
              { ref: "OUT1", pin: "1" },
              { ref: "C_OUT", pin: "1" },
              { ref: "R1", pin: "1" },
            ],
          },
          {
            name: "GND",
            pins: [
              { ref: "IN1", pin: "2" },
              { ref: "OUT1", pin: "2" },
              { ref: "C_IN", pin: "2" },
              { ref: "C_OUT", pin: "2" },
            ],
          },
        ],
      },
      footprints: [],
    },
  },
  {
    id: "gabas_rtos",
    name: "GABAS RTOS Node Controller",
    filename: "GABAS_RTOS.pbrp",
    description: "Sistem controller STM32/ESP32 dengan I2C Header, power terminal, sensor pullups, dan status LED.",
    boardSize: "8 × 12 cm (31×47 lubang)",
    cols: 31,
    rows: 47,
    project: {
      version: 1,
      state: {
        config: { cols: 31, rows: 47, pitchMm: 2.54 },
        components: [
          { id: "c1", footprint: "ESP32_DEVKIT", ref: "MCU1", anchor: { col: 8, row: 10 }, rotation: 0, placed: true },
          { id: "c2", footprint: "PINHDR_1x4", ref: "I2C_HDR", anchor: { col: 3, row: 4 }, rotation: 0, placed: true },
          { id: "c3", footprint: "SCREW_2", ref: "PWR_IN", anchor: { col: 3, row: 40 }, rotation: 0, placed: true },
          { id: "c4", footprint: "R_AXIAL_0.4", ref: "R_SDA", anchor: { col: 10, row: 4 }, rotation: 0, placed: true },
          { id: "c5", footprint: "R_AXIAL_0.4", ref: "R_SCL", anchor: { col: 10, row: 7 }, rotation: 0, placed: true },
        ],
        traces: [],
        nets: [
          {
            name: "+3V3",
            pins: [
              { ref: "I2C_HDR", pin: "1" },
              { ref: "R_SDA", pin: "1" },
              { ref: "R_SCL", pin: "1" },
            ],
          },
          {
            name: "GND",
            pins: [
              { ref: "I2C_HDR", pin: "2" },
              { ref: "PWR_IN", pin: "2" },
            ],
          },
          {
            name: "SCL",
            pins: [
              { ref: "I2C_HDR", pin: "3" },
              { ref: "R_SCL", pin: "2" },
            ],
          },
          {
            name: "SDA",
            pins: [
              { ref: "I2C_HDR", pin: "4" },
              { ref: "R_SDA", pin: "2" },
            ],
          },
        ],
      },
      footprints: [],
    },
  },
];
