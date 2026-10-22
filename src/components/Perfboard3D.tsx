"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BoardEngine } from "@/engine/BoardEngine";
import { palette, hexToInt } from "@/lib/theme";

/**
 * Phase-2 3D view: simple box primitives per component on a board plane, for
 * seeing physical placement + a bit of aesthetics. Not a realistic model import.
 *
 * The renderer/scene/camera/controls are built ONCE (mount) and the animation
 * loop runs persistently; only the board/pad/component meshes are rebuilt when
 * the design changes (rev), so there's no WebGL-context churn or leak.
 */
export default function Perfboard3D({ engine, rev }: { engine: BoardEngine; rev: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const controlsRef = useRef<OrbitControls>();
  const contentRef = useRef<THREE.Group>();

  // Build the scene once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(hexToInt(palette.bg));

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(100, 150, 100);
    scene.add(dir);

    const content = new THREE.Group();
    scene.add(content);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    contentRef.current = content;

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
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
      disposeGroup(content);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild only the meshes when the design changes.
  useEffect(() => {
    const scene = sceneRef.current;
    const content = contentRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !content || !camera || !controls) return;

    disposeGroup(content);

    const cfg = engine.getConfig();
    const cx = (cfg.cols - 1) / 2;
    const cz = (cfg.rows - 1) / 2;
    const span = Math.max(cfg.cols, cfg.rows);

    // Board.
    const boardThickness = 0.3;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.cols + 1, boardThickness, cfg.rows + 1),
      new THREE.MeshStandardMaterial({ color: hexToInt(palette.board3d), roughness: 0.9 }),
    );
    board.position.set(cx, -boardThickness / 2, cz);
    content.add(board);

    // Pads (instanced).
    const padMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: hexToInt(palette.pad), metalness: 0.4, roughness: 0.5 }),
      cfg.cols * cfg.rows,
    );
    const m = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < cfg.rows; r++)
      for (let c = 0; c < cfg.cols; c++) {
        m.makeTranslation(c, 0.02, r);
        padMesh.setMatrixAt(i++, m);
      }
    content.add(padMesh);

    // Component boxes.
    const compMat = new THREE.MeshStandardMaterial({ color: hexToInt(palette.comp3d), roughness: 0.6 });
    for (const comp of engine.getComponents()) {
      const bb = engine.componentBounds(comp.id);
      const hMm = engine.getFootprint(comp.footprint)?.body.height ?? 6;
      const hUnits = Math.max(0.4, hMm / cfg.pitchMm);
      const box = new THREE.Mesh(new THREE.BoxGeometry(bb.maxC - bb.minC + 0.8, hUnits, bb.maxR - bb.minR + 0.8), compMat);
      box.position.set((bb.minC + bb.maxC) / 2, hUnits / 2 + 0.05, (bb.minR + bb.maxR) / 2);
      content.add(box);
    }

    // Aim the camera at the board (keep user's current orbit distance if already set).
    controls.target.set(cx, 0, cz);
    if (camera.position.lengthSq() === 0 || rev === 0) {
      camera.position.set(cx, span * 0.9, cz + span * 1.1);
    }
    controls.update();
  }, [engine, rev]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

function disposeGroup(group: THREE.Group) {
  for (const obj of group.children.slice()) {
    group.remove(obj);
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  }
}
