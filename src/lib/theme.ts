/**
 * Single source of truth for colors used by the canvas, PNG and 3D renderers,
 * so a tweak lands everywhere instead of in five scattered literals.
 * (CSS chrome keeps its own variables in globals.css.)
 */

export const palette = {
  bg: "#0f1216",
  pad: "#c98a4d",
  hole: "#0f1216",
  bottomTrace: "#49c06a",
  jumperTrace: "#e0b34a",
  accent: "#4ea1ff",
  danger: "#ff5a5a",
  airwire: "rgba(120,200,120,0.55)",
  routeStart: "#ffd166",
  text: "#e6edf3",
  muted: "#8b98a5",
  board3d: "#b5702f",
  comp3d: "#3a6bd6",
} as const;

/** Darker, high-contrast colors for printing on white paper (not the screen palette). */
export const printPalette = {
  pad: [150, 150, 150] as [number, number, number],
  component: [40, 90, 170] as [number, number, number],
  bottomTrace: [0, 120, 40] as [number, number, number],
  jumperTrace: [190, 120, 0] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

/** "#rrggbb" -> 0xrrggbb for three.js. */
export function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
