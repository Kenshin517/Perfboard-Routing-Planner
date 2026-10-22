/**
 * Built-in realistic 3D models for common components, built procedurally in
 * three.js (no external asset files). Recognisable shapes for the important
 * parts; a plain box for anything unknown.
 *
 * Coordinates are board-hole units (x = col, z = row, y = up). Each builder is
 * handed the pin bounding box so the model sits over its pads.
 */

import * as THREE from "three";
import { modelColors } from "@/lib/theme";

export interface ModelContext {
  /** Pin bounding box in holes. */
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
  /** Component height in hole-units (from footprint height / pitch). */
  heightUnits: number;
  footprintName: string;
  value: string;
}

const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });

/** Pick a model kind from footprint name first, then the component value. */
function kindOf(footprintName: string, value: string): string {
  const f = footprintName.toUpperCase();
  const v = value.toUpperCase();
  if (f.startsWith("TO-220") || /\b78\d\d\b|\bL78|\bLM78|REG|TO-?220/.test(v)) return "to220";
  if (f.startsWith("DIODE") || f.includes("LED") || /\bLED\b/.test(v)) return "led";
  if (f.startsWith("DIP")) return "dip";
  if (f.startsWith("PINHDR") || f.startsWith("SCREW")) return "header";
  if (f.startsWith("R_") || /^R?\d+[KMR]/.test(v) || /\bRES/.test(v)) return "resistor";
  if (f.startsWith("C_") || /\bCAP|\dUF|\dNF|\dPF/.test(v)) return "cap";
  if (f.startsWith("ESP32")) return "esp32";
  return "box";
}

/** Build a model Group centred on the pin bbox, sitting on the board (y=0 top). */
export function buildComponentModel(ctx: ModelContext): THREE.Object3D {
  const cx = (ctx.minC + ctx.maxC) / 2;
  const cz = (ctx.minR + ctx.maxR) / 2;
  const w = ctx.maxC - ctx.minC + 1;
  const d = ctx.maxR - ctx.minR + 1;
  const g = new THREE.Group();
  const kind = kindOf(ctx.footprintName, ctx.value);

  switch (kind) {
    case "to220": {
      // Black body standing up, metal tab on top, 3 legs down.
      const bodyH = Math.max(1.6, ctx.heightUnits);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, bodyH, 0.5), mat(modelColors.blackPlastic, { roughness: 0.8 }));
      body.position.set(cx, bodyH / 2, cz);
      g.add(body);
      const tab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, bodyH * 0.35, 0.12), mat(modelColors.metalTab, { metalness: 0.8, roughness: 0.3 }));
      tab.position.set(cx, bodyH * 0.82, cz - 0.28);
      g.add(tab);
      addLegs(g, ctx, 3, modelColors.legMetal);
      break;
    }
    case "led": {
      // Cylinder body + hemisphere dome + two legs.
      const r = Math.min(w, d) * 0.4;
      const bodyH = Math.max(0.8, ctx.heightUnits * 0.7);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bodyH, 20), mat(modelColors.ledRed, { transparent: true, opacity: 0.85 }));
      cyl.position.set(cx, bodyH / 2, cz);
      g.add(cyl);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(modelColors.ledDome, { transparent: true, opacity: 0.85 }));
      dome.position.set(cx, bodyH, cz);
      g.add(dome);
      addLegsAtPins(g, ctx, modelColors.legMetal);
      break;
    }
    case "dip": {
      const bodyH = Math.max(0.5, ctx.heightUnits);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, bodyH, d * 0.95), mat(modelColors.blackPlastic, { roughness: 0.7 }));
      body.position.set(cx, bodyH / 2, cz);
      g.add(body);
      // pin-1 notch (small dark cylinder at one end)
      const notch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, bodyH + 0.02, 12), mat(0x000000));
      notch.position.set(cx, bodyH / 2, ctx.minR);
      g.add(notch);
      addLegsAtPins(g, ctx, modelColors.goldPin);
      break;
    }
    case "header": {
      // Black base + gold square pins at each pad.
      const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.25, d * 0.9), mat(modelColors.blackPlastic));
      base.position.set(cx, 0.12, cz);
      g.add(base);
      addPinPosts(g, ctx, modelColors.goldPin, Math.max(0.8, ctx.heightUnits));
      break;
    }
    case "resistor": {
      // Beige cylinder lying across its leads + colour bands.
      const len = (ctx.maxC - ctx.minC) * 0.7 + 0.2;
      const r = 0.22;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat(modelColors.resistorBody, { roughness: 0.5 }));
      body.rotation.z = Math.PI / 2;
      body.position.set(cx, r + 0.15, cz);
      g.add(body);
      for (const [i, c] of [0x6b3f1f, 0x000000, 0xcc2222].entries()) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.08, 16), mat(c));
        band.rotation.z = Math.PI / 2;
        band.position.set(cx - len * 0.25 + i * 0.18, r + 0.15, cz);
        g.add(band);
      }
      addLegsAtPins(g, ctx, modelColors.legMetal);
      break;
    }
    case "cap": {
      const r = Math.min(w, d) * 0.42;
      const h = Math.max(1, ctx.heightUnits);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(modelColors.capBody, { roughness: 0.4 }));
      body.position.set(cx, h / 2, cz);
      g.add(body);
      addLegsAtPins(g, ctx, modelColors.legMetal);
      break;
    }
    case "esp32": {
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.12, d * 0.95), mat(modelColors.pcbGreen, { roughness: 0.8 }));
      pcb.position.set(cx, 0.06, cz);
      g.add(pcb);
      const can = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, Math.max(0.6, ctx.heightUnits * 0.5), d * 0.4), mat(modelColors.shieldCan, { metalness: 0.7, roughness: 0.3 }));
      can.position.set(cx, 0.12 + Math.max(0.6, ctx.heightUnits * 0.5) / 2, cz - d * 0.2);
      g.add(can);
      addPinPosts(g, ctx, modelColors.goldPin, 0.5);
      break;
    }
    default: {
      const h = Math.max(0.4, ctx.heightUnits);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, h, d * 0.8), mat(modelColors.genericBody));
      box.position.set(cx, h / 2 + 0.05, cz);
      g.add(box);
    }
  }
  return g;
}

/** N legs evenly spread along the bottom edge. */
function addLegs(g: THREE.Group, ctx: ModelContext, n: number, color: number) {
  const legMat = mat(color, { metalness: 0.6, roughness: 0.4 });
  const w = ctx.maxC - ctx.minC;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = ctx.minC + t * w;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), legMat);
    leg.position.set(x, -0.3, (ctx.minR + ctx.maxR) / 2);
    g.add(leg);
  }
}

/** A leg at each pad hole (for parts whose pins map 1:1 to holes). */
function addLegsAtPins(g: THREE.Group, ctx: ModelContext, color: number) {
  const legMat = mat(color, { metalness: 0.6, roughness: 0.4 });
  for (let c = ctx.minC; c <= ctx.maxC; c++)
    for (let r = ctx.minR; r <= ctx.maxR; r++) {
      if (c !== ctx.minC && c !== ctx.maxC && r !== ctx.minR && r !== ctx.maxR) continue;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), legMat);
      leg.position.set(c, -0.25, r);
      g.add(leg);
    }
}

/** Upright square pins at every hole (headers / module pin rows). */
function addPinPosts(g: THREE.Group, ctx: ModelContext, color: number, h: number) {
  const pinMat = mat(color, { metalness: 0.7, roughness: 0.3 });
  for (let c = ctx.minC; c <= ctx.maxC; c++)
    for (let r = ctx.minR; r <= ctx.maxR; r++) {
      if (c !== ctx.minC && c !== ctx.maxC && r !== ctx.minR && r !== ctx.maxR) continue;
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), pinMat);
      pin.position.set(c, h / 2 + 0.2, r);
      g.add(pin);
    }
}
