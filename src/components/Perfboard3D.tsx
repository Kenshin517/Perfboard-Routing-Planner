"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BoardEngine } from "@/engine/BoardEngine";

/**
 * Phase-2 3D view: simple box primitives per component on a board plane, for
 * seeing physical placement + a bit of aesthetics. Not a realistic model import.
 * Units = holes; heights come from footprint.height (mm) scaled by pitch.
 */
export default function Perfboard3D({ engine, rev }: { engine: BoardEngine; rev: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    const cfg = engine.getConfig();
    const cx = (cfg.cols - 1) / 2;
    const cz = (cfg.rows - 1) / 2;
    const span = Math.max(cfg.cols, cfg.rows);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1216);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(cx, span * 0.9, cz + span * 1.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(cx + span, span * 1.5, cz + span);
    scene.add(dir);

    // Board plane (phenolic brown).
    const boardThickness = 0.3;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.cols + 1, boardThickness, cfg.rows + 1),
      new THREE.MeshStandardMaterial({ color: 0xb5702f, roughness: 0.9 }),
    );
    board.position.set(cx, -boardThickness / 2, cz);
    scene.add(board);

    // Pad dots on top of the board.
    const padGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10);
    const padMat = new THREE.MeshStandardMaterial({ color: 0xc98a4d, metalness: 0.4, roughness: 0.5 });
    const padMesh = new THREE.InstancedMesh(padGeo, padMat, cfg.cols * cfg.rows);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        m.makeTranslation(c, 0.02, r);
        padMesh.setMatrixAt(i++, m);
      }
    }
    scene.add(padMesh);

    // Component boxes.
    const compMat = new THREE.MeshStandardMaterial({ color: 0x3a6bd6, roughness: 0.6 });
    for (const comp of engine.getComponents()) {
      const pins = engine.pinPositions(comp.id).map((p) => p.coord);
      const minC = Math.min(...pins.map((p) => p.col)), maxC = Math.max(...pins.map((p) => p.col));
      const minR = Math.min(...pins.map((p) => p.row)), maxR = Math.max(...pins.map((p) => p.row));
      const fp = engine.getFootprint(comp.footprint);
      const hMm = fp?.body.height ?? 6;
      const hUnits = Math.max(0.4, hMm / cfg.pitchMm);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(maxC - minC + 0.8, hUnits, maxR - minR + 0.8),
        compMat,
      );
      box.position.set((minC + maxC) / 2, hUnits / 2 + 0.05, (minR + maxR) / 2);
      scene.add(box);
    }

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [engine, rev]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
