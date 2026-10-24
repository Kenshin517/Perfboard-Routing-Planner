"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardEngine } from "@/engine/BoardEngine";
import {
  type SchematicComponent,
  type SchematicWire,
  type SymbolType,
  getSymbolPins,
  footprintToSymbolType,
  symbolTypeToFootprint,
} from "@/engine/schematicTypes";

interface Props {
  engine: BoardEngine;
  onSyncToBoard: () => void;
  onOpenPcb: () => void;
  projectName?: string;
}

export default function SchematicEditor({
  engine,
  onSyncToBoard,
  onOpenPcb,
  projectName = "q22",
}: Props) {
  const [components, setComponents] = useState<SchematicComponent[]>([]);
  const [wires, setWires] = useState<SchematicWire[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"select" | "wire">("select");
  const [wireStartPin, setWireStartPin] = useState<{
    compRef: string;
    pin: string;
    x: number;
    y: number;
  } | null>(null);
  const [wireCurrentPos, setWireCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [armedSymbol, setArmedSymbol] = useState<SymbolType | null>(null);

  // Pan and zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 80, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Dragging component
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Initialize schematic components & wires from engine on mount or when engine changes
  useEffect(() => {
    const existingComps = engine.getComponents();
    const existingNets = engine.getNets();

    if (existingComps.length > 0 && components.length === 0) {
      // Auto-layout existing components on schematic sheet
      const startX = 220;
      const startY = 180;
      const spacingX = 140;
      const spacingY = 130;
      const colsCount = 3;

      const generatedComps: SchematicComponent[] = existingComps.map((c, i) => {
        const col = i % colsCount;
        const row = Math.floor(i / colsCount);
        return {
          id: c.id,
          ref: c.ref,
          value: c.value ?? (c.footprint.startsWith("R_") ? "10k" : c.footprint.startsWith("C_") ? "100nF" : c.footprint),
          footprint: c.footprint,
          symbolType: footprintToSymbolType(c.footprint),
          x: startX + col * spacingX,
          y: startY + row * spacingY,
          rotation: 0,
        };
      });

      // Generate wires from existing nets
      const generatedWires: SchematicWire[] = [];
      existingNets.forEach((net, netIdx) => {
        const pins = net.pins;
        for (let j = 0; j < pins.length - 1; j++) {
          const fromPin = pins[j];
          const toPin = pins[j + 1];
          const fromComp = generatedComps.find((c) => c.ref === fromPin.ref);
          const toComp = generatedComps.find((c) => c.ref === toPin.ref);
          if (fromComp && toComp) {
            const fromPins = getSymbolPins(fromComp.symbolType);
            const toPins = getSymbolPins(toComp.symbolType);
            const fp = fromPins.find((p) => p.num === fromPin.pin) ?? fromPins[0];
            const tp = toPins.find((p) => p.num === toPin.pin) ?? toPins[0];

            generatedWires.push({
              id: `w_${netIdx}_${j}`,
              netName: net.name,
              from: {
                compRef: fromComp.ref,
                pin: fromPin.pin,
                x: fromComp.x + (fp?.x ?? 0),
                y: fromComp.y + (fp?.y ?? 0),
              },
              to: {
                compRef: toComp.ref,
                pin: toPin.pin,
                x: toComp.x + (tp?.x ?? 0),
                y: toComp.y + (tp?.y ?? 0),
              },
            });
          }
        }
      });

      setComponents(generatedComps);
      setWires(generatedWires);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Sync to Board Engine
  const handleSyncToEngine = () => {
    // 1. Ensure all components exist in engine
    components.forEach((sc) => {
      const existing = engine.getComponent(sc.id);
      if (!existing) {
        engine.addComponent({
          footprint: sc.footprint,
          ref: sc.ref,
          value: sc.value,
          anchor: { col: 2, row: 2 },
          placed: false,
        });
      }
    });

    // 2. Build nets from wires
    const netMap = new Map<string, { ref: string; pin: string }[]>();
    wires.forEach((w) => {
      const netName = w.netName || `NET_${w.from.compRef}_${w.to.compRef}`;
      const list = netMap.get(netName) ?? [];
      if (!list.some((p) => p.ref === w.from.compRef && p.pin === w.from.pin)) {
        list.push({ ref: w.from.compRef, pin: w.from.pin });
      }
      if (!list.some((p) => p.ref === w.to.compRef && p.pin === w.to.pin)) {
        list.push({ ref: w.to.compRef, pin: w.to.pin });
      }
      netMap.set(netName, list);
    });

    const netArray = Array.from(netMap.entries()).map(([name, pins]) => ({
      name,
      pins,
    }));
    if (netArray.length > 0) {
      engine.setNets(netArray);
    }

    onSyncToBoard();
  };

  // Add new component to schematic
  const handleAddSymbol = (type: SymbolType) => {
    const nextNum = components.filter((c) => c.symbolType === type).length + 1;
    let prefix = "U";
    if (type === "resistor") prefix = "R";
    if (type === "capacitor") prefix = "C";
    if (type === "diode") prefix = "D";
    if (type === "header2" || type === "header4") prefix = "J";
    if (type === "to220") prefix = "Q";
    if (type === "esp32") prefix = "MCU";
    if (type === "vcc") prefix = "VCC";
    if (type === "gnd") prefix = "GND";

    const ref = `${prefix}${nextNum}`;
    const footprint = symbolTypeToFootprint(type);

    const newComp: SchematicComponent = {
      id: `sch_cmp_${Date.now()}_${Math.random()}`,
      ref,
      value: type === "resistor" ? "10k" : type === "capacitor" ? "100nF" : type,
      footprint,
      symbolType: type,
      x: 340 + (components.length % 4) * 30,
      y: 220 + (components.length % 3) * 30,
      rotation: 0,
    };

    setComponents((prev) => [...prev, newComp]);
    setSelectedCompId(newComp.id);
    setArmedSymbol(null);
  };

  // Click on pin in Wire Mode
  const handlePinClick = (
    e: React.MouseEvent,
    comp: SchematicComponent,
    pin: { num: string; name: string; x: number; y: number },
  ) => {
    e.stopPropagation();
    const pinAbsX = comp.x + pin.x;
    const pinAbsY = comp.y + pin.y;

    if (activeTool === "wire") {
      if (!wireStartPin) {
        // Start wire
        setWireStartPin({
          compRef: comp.ref,
          pin: pin.num,
          x: pinAbsX,
          y: pinAbsY,
        });
      } else {
        // Finish wire
        if (wireStartPin.compRef === comp.ref && wireStartPin.pin === pin.num) {
          // Cannot connect to self
          setWireStartPin(null);
          return;
        }

        const newWire: SchematicWire = {
          id: `wire_${Date.now()}`,
          netName: `NET_${wireStartPin.compRef}_${comp.ref}`,
          from: wireStartPin,
          to: {
            compRef: comp.ref,
            pin: pin.num,
            x: pinAbsX,
            y: pinAbsY,
          },
        };

        setWires((prev) => [...prev, newWire]);
        setWireStartPin(null);
        setWireCurrentPos(null);
      }
    }
  };

  // Keyboard shortcut for delete & rotate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCompId) {
          const compToDelete = components.find((c) => c.id === selectedCompId);
          setComponents((prev) => prev.filter((c) => c.id !== selectedCompId));
          if (compToDelete) {
            setWires((prev) =>
              prev.filter(
                (w) => w.from.compRef !== compToDelete.ref && w.to.compRef !== compToDelete.ref,
              ),
            );
          }
          setSelectedCompId(null);
        }
      } else if (e.key.toLowerCase() === "r" && selectedCompId) {
        setComponents((prev) =>
          prev.map((c) =>
            c.id === selectedCompId
              ? { ...c, rotation: ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
              : c,
          ),
        );
      } else if (e.key.toLowerCase() === "w") {
        setActiveTool((t) => (t === "wire" ? "select" : "wire"));
        setWireStartPin(null);
      } else if (e.key === "Escape") {
        setWireStartPin(null);
        setArmedSymbol(null);
        setActiveTool("select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCompId, components]);

  // Update wire positions when a component moves
  const updateCompPosition = (id: string, newX: number, newY: number) => {
    const comp = components.find((c) => c.id === id);
    if (!comp) return;

    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x: newX, y: newY } : c)),
    );

    // Update wires connected to this component
    setWires((prev) =>
      prev.map((w) => {
        let updated = { ...w };
        if (w.from.compRef === comp.ref) {
          const pins = getSymbolPins(comp.symbolType);
          const p = pins.find((pin) => pin.num === w.from.pin) ?? pins[0];
          updated.from = {
            ...updated.from,
            x: newX + (p?.x ?? 0),
            y: newY + (p?.y ?? 0),
          };
        }
        if (w.to.compRef === comp.ref) {
          const pins = getSymbolPins(comp.symbolType);
          const p = pins.find((pin) => pin.num === w.to.pin) ?? pins[0];
          updated.to = {
            ...updated.to,
            x: newX + (p?.x ?? 0),
            y: newY + (p?.y ?? 0),
          };
        }
        return updated;
      }),
    );
  };

  // Canvas Mouse Events
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+drag = Pan
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (e.button === 0 && armedSymbol) {
      // Place armed symbol at mouse
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      handleAddSymbolAt(armedSymbol, Math.round(mouseX / 10) * 10, Math.round(mouseY / 10) * 10);
      setArmedSymbol(null);
    }
  };

  const handleAddSymbolAt = (type: SymbolType, x: number, y: number) => {
    const nextNum = components.filter((c) => c.symbolType === type).length + 1;
    let prefix = "U";
    if (type === "resistor") prefix = "R";
    if (type === "capacitor") prefix = "C";
    if (type === "diode") prefix = "D";
    if (type === "header2" || type === "header4") prefix = "J";
    if (type === "to220") prefix = "Q";
    if (type === "esp32") prefix = "MCU";
    if (type === "vcc") prefix = "VCC";
    if (type === "gnd") prefix = "GND";

    const newComp: SchematicComponent = {
      id: `sch_${Date.now()}_${Math.random()}`,
      ref: `${prefix}${nextNum}`,
      value: type === "resistor" ? "10k" : type === "capacitor" ? "100nF" : type,
      footprint: symbolTypeToFootprint(type),
      symbolType: type,
      x,
      y,
      rotation: 0,
    };
    setComponents((prev) => [...prev, newComp]);
    setSelectedCompId(newComp.id);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    if (draggingCompId) {
      const newX = Math.round((mouseX - dragOffsetRef.current.x) / 10) * 10;
      const newY = Math.round((mouseY - dragOffsetRef.current.y) / 10) * 10;
      updateCompPosition(draggingCompId, newX, newY);
    }

    if (activeTool === "wire" && wireStartPin) {
      setWireCurrentPos({ x: mouseX, y: mouseY });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggingCompId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.max(0.4, Math.min(2.5, z * delta)));
  };

  return (
    <div style={editorContainer}>
      {/* ── Top Schematic Toolbar ──────────────────────────────────── */}
      <div style={toolbar}>
        <div style={toolGroup}>
          <button
            style={{ ...toolBtn, ...(activeTool === "select" ? activeToolBtn : {}) }}
            onClick={() => {
              setActiveTool("select");
              setWireStartPin(null);
            }}
            title="Select / Move Tool (S)"
          >
            ↖ Select
          </button>
          <button
            style={{ ...toolBtn, ...(activeTool === "wire" ? activeToolBtn : {}) }}
            onClick={() => {
              setActiveTool("wire");
              setWireStartPin(null);
            }}
            title="Wire Tool (W) - Klik pin ke pin untuk sambung jalur"
          >
            ⚡ Wire (W)
          </button>
        </div>

        <div style={vSep} />

        {/* Place Symbols */}
        <div style={symbolGroup}>
          <span style={toolbarLabel}>Simbol:</span>
          <button style={symbolBtn} onClick={() => handleAddSymbol("resistor")} title="Tambah Resistor">
            R (Resistor)
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("capacitor")} title="Tambah Kapasitor">
            C (Capacitor)
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("diode")} title="Tambah Dioda / LED">
            D (Diode)
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("ic8")} title="Tambah IC DIP-8 (NE555, Op-Amp)">
            DIP-8 IC
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("header2")} title="Tambah Header 2P / Terminal">
            Header 2P
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("header4")} title="Tambah Header 4P">
            Header 4P
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("to220")} title="Tambah TO-220 (Regulator/Transistor)">
            TO-220
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("vcc")} title="Tambah VCC (+5V / +3V3)">
            ▲ VCC
          </button>
          <button style={symbolBtn} onClick={() => handleAddSymbol("gnd")} title="Tambah GND (Ground)">
            ▼ GND
          </button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <button style={syncBtn} onClick={handleSyncToEngine} title="Sinkronisasi komponen & netlist ke board Perfboard">
            ⚡ Sync ke Perfboard
          </button>
          <button style={openPcbBtn} onClick={onOpenPcb} title="Pindah ke tampilan PCB1 (Perfboard Bolong)">
            Buka PCB1 (Perfboard) →
          </button>
          <div style={vSep} />
          <button style={toolBtn} onClick={() => { setZoom(1); setPan({ x: 80, y: 50 }); }} title="Reset Zoom">
            100%
          </button>
        </div>
      </div>

      {/* ── Schematic Drawing Sheet Canvas (EasyEDA A4 Style) ──────── */}
      <div
        style={canvasWrap}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onWheel={handleWheel}
      >
        <svg
          style={{
            width: "100%",
            height: "100%",
            cursor: activeTool === "wire" ? "crosshair" : isPanning ? "grabbing" : "default",
          }}
        >
          {/* Engineering grid definition */}
          <defs>
            <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e8edf2" strokeWidth="0.5" />
            </pattern>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <rect width="50" height="50" fill="url(#smallGrid)" />
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d5dfea" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Root Transform group for Zoom and Pan */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* ── Standard EasyEDA A4 Drawing Border (Image 2) ────────── */}
            <g id="easyeda-border">
              {/* Outer frame */}
              <rect
                x="40"
                y="30"
                width="920"
                height="650"
                fill="#ffffff"
                stroke="#c0392b"
                strokeWidth="2.5"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.06))"
              />
              {/* Inner frame */}
              <rect
                x="48"
                y="38"
                width="904"
                height="634"
                fill="none"
                stroke="#c0392b"
                strokeWidth="1.2"
              />

              {/* Coordinate markings: Top & Bottom 1..6 */}
              {[1, 2, 3, 4, 5, 6].map((num, i) => {
                const markX = 48 + (904 / 6) * (i + 0.5);
                const divX = 48 + (904 / 6) * (i + 1);
                return (
                  <g key={`num-${num}`}>
                    {/* Top markings */}
                    <text x={markX} y="36" fill="#c0392b" fontSize="9" textAnchor="middle" fontWeight="bold">
                      {num}
                    </text>
                    {i < 5 && <line x1={divX} y1="30" x2={divX} y2="38" stroke="#c0392b" strokeWidth="1" />}
                    {/* Bottom markings */}
                    <text x={markX} y="678" fill="#c0392b" fontSize="9" textAnchor="middle" fontWeight="bold">
                      {num}
                    </text>
                    {i < 5 && <line x1={divX} y1="664" x2={divX} y2="672" stroke="#c0392b" strokeWidth="1" />}
                  </g>
                );
              })}

              {/* Coordinate markings: Left & Right A..D */}
              {["A", "B", "C", "D"].map((letter, i) => {
                const markY = 38 + (634 / 4) * (i + 0.5);
                const divY = 38 + (634 / 4) * (i + 1);
                return (
                  <g key={`letter-${letter}`}>
                    {/* Left markings */}
                    <text x="44" y={markY + 3} fill="#c0392b" fontSize="9" textAnchor="middle" fontWeight="bold">
                      {letter}
                    </text>
                    {i < 3 && <line x1="40" y1={divY} x2="48" y2={divY} stroke="#c0392b" strokeWidth="1" />}
                    {/* Right markings */}
                    <text x="956" y={markY + 3} fill="#c0392b" fontSize="9" textAnchor="middle" fontWeight="bold">
                      {letter}
                    </text>
                    {i < 3 && <line x1="952" y1={divY} x2="960" y2={divY} stroke="#c0392b" strokeWidth="1" />}
                  </g>
                );
              })}

              {/* ── EasyEDA Title Block (Bottom-Right Table) ──────────── */}
              <g id="title-block" transform="translate(572, 542)">
                <rect x="0" y="0" width="380" height="130" fill="#ffffff" stroke="#c0392b" strokeWidth="1.5" />

                {/* Table Horizontal Lines */}
                <line x1="0" y1="26" x2="380" y2="26" stroke="#c0392b" strokeWidth="1" />
                <line x1="0" y1="52" x2="380" y2="52" stroke="#c0392b" strokeWidth="1" />
                <line x1="0" y1="78" x2="380" y2="78" stroke="#c0392b" strokeWidth="1" />
                <line x1="0" y1="104" x2="380" y2="104" stroke="#c0392b" strokeWidth="1" />

                {/* Table Vertical Columns */}
                <line x1="70" y1="0" x2="70" y2="104" stroke="#c0392b" strokeWidth="1" />
                <line x1="240" y1="0" x2="240" y2="52" stroke="#c0392b" strokeWidth="1" />
                <line x1="290" y1="0" x2="290" y2="52" stroke="#c0392b" strokeWidth="1" />
                <line x1="140" y1="104" x2="140" y2="130" stroke="#c0392b" strokeWidth="1" />
                <line x1="200" y1="104" x2="200" y2="130" stroke="#c0392b" strokeWidth="1" />
                <line x1="260" y1="104" x2="260" y2="130" stroke="#c0392b" strokeWidth="1" />

                {/* Row 1: Schematic */}
                <text x="35" y="17" fill="#666666" fontSize="10" textAnchor="middle">Schematic</text>
                <text x="155" y="17" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">Schematic1</text>
                <text x="265" y="17" fill="#666666" fontSize="10" textAnchor="middle">Create at</text>
                <text x="335" y="17" fill="#111111" fontSize="10" textAnchor="middle">2026-10-24</text>

                {/* Row 2: Board */}
                <text x="35" y="43" fill="#666666" fontSize="10" textAnchor="middle">Board</text>
                <text x="155" y="43" fill="#111111" fontSize="11" textAnchor="middle">Board1</text>
                <text x="265" y="43" fill="#666666" fontSize="10" textAnchor="middle">Update at</text>
                <text x="335" y="43" fill="#111111" fontSize="10" textAnchor="middle">2026-10-24</text>

                {/* Row 3: Drawn / Page */}
                <text x="35" y="69" fill="#666666" fontSize="10" textAnchor="middle">Drawn</text>
                <text x="155" y="69" fill="#111111" fontSize="11" textAnchor="middle">Bagas</text>
                <text x="265" y="69" fill="#666666" fontSize="10" textAnchor="middle">Page</text>
                <text x="335" y="69" fill="#111111" fontSize="10" textAnchor="middle">P1</text>

                {/* Row 4: Project Title */}
                <text x="35" y="95" fill="#666666" fontSize="10" textAnchor="middle">Reviewed</text>
                <text x="225" y="96" fill="#111111" fontSize="15" fontWeight="bold" textAnchor="middle">
                  {projectName}
                </text>

                {/* Row 5: EasyEDA Branding & Version */}
                {/* Logo */}
                <g transform="translate(16, 108)">
                  <path
                    d="M6 13C3.79 13 2 11.21 2 9C2 7.04 3.42 5.42 5.31 5.07C6.01 2.72 8.35 1 11 1C14.07 1 16.61 3.26 16.96 6.27C18.67 6.64 20 8.16 20 10C20 12.21 18.21 14 16 14L6 14"
                    fill="none"
                    stroke="#1890ff"
                    strokeWidth="1.8"
                  />
                  <text x="26" y="11" fill="#1890ff" fontSize="12" fontWeight="bold">EasyEDA</text>
                </g>
                <text x="170" y="120" fill="#666666" fontSize="10" textAnchor="middle">V1.0</text>
                <text x="230" y="120" fill="#666666" fontSize="10" textAnchor="middle">A4</text>
                <text x="320" y="120" fill="#666666" fontSize="10" textAnchor="middle">Page 1 Total 1</text>
              </g>
            </g>

            {/* ── Schematic Wires ────────────────────────────────────── */}
            {wires.map((wire) => (
              <g key={wire.id}>
                {/* Wire path (green schematic line) */}
                <path
                  d={`M ${wire.from.x} ${wire.from.y} L ${wire.to.x} ${wire.to.y}`}
                  stroke="#008800"
                  strokeWidth="2"
                  fill="none"
                />
                {/* Junction dots */}
                <circle cx={wire.from.x} cy={wire.from.y} r="3" fill="#008800" />
                <circle cx={wire.to.x} cy={wire.to.y} r="3" fill="#008800" />
                {/* Net name label */}
                {wire.netName && (
                  <text
                    x={(wire.from.x + wire.to.x) / 2}
                    y={(wire.from.y + wire.to.y) / 2 - 5}
                    fill="#0066cc"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {wire.netName}
                  </text>
                )}
              </g>
            ))}

            {/* Active wire being drawn */}
            {activeTool === "wire" && wireStartPin && wireCurrentPos && (
              <line
                x1={wireStartPin.x}
                y1={wireStartPin.y}
                x2={wireCurrentPos.x}
                y2={wireCurrentPos.y}
                stroke="#00aa00"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}

            {/* ── Schematic Components ───────────────────────────────── */}
            {components.map((comp) => {
              const isSelected = comp.id === selectedCompId;
              const pins = getSymbolPins(comp.symbolType);

              return (
                <g
                  key={comp.id}
                  transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`}
                  style={{ cursor: "move" }}
                  onMouseDown={(e) => {
                    if (e.button === 0 && activeTool === "select") {
                      e.stopPropagation();
                      setSelectedCompId(comp.id);
                      setDraggingCompId(comp.id);
                      const rect = e.currentTarget.getBoundingClientRect();
                      dragOffsetRef.current = {
                        x: (e.clientX - rect.left) / zoom - comp.x,
                        y: (e.clientY - rect.top) / zoom - comp.y,
                      };
                    }
                  }}
                >
                  {/* Selection halo */}
                  {isSelected && (
                    <rect
                      x="-42"
                      y="-40"
                      width="84"
                      height="80"
                      fill="rgba(40, 158, 224, 0.12)"
                      stroke="#289ee0"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                      rx="4"
                    />
                  )}

                  {/* Component Symbol Graphics */}
                  {renderSymbolGraphic(comp.symbolType, comp.ref, comp.value)}

                  {/* Interactive Pin Nodes */}
                  {pins.map((pin) => (
                    <g
                      key={pin.num}
                      transform={`translate(${pin.x}, ${pin.y})`}
                      style={{ cursor: "crosshair" }}
                      onClick={(e) => handlePinClick(e, comp, pin)}
                    >
                      <title>{`Pin ${pin.num} (${pin.name})`}</title>
                      <circle cx="0" cy="0" r="4.5" fill="#ffffff" stroke="#c0392b" strokeWidth="1.4" />
                      <circle cx="0" cy="0" r="2" fill="#c0392b" />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ── Schematic Symbol Graphics Renderer ───────────────────────────── */

function renderSymbolGraphic(type: SymbolType, ref: string, value: string) {
  switch (type) {
    case "resistor":
      return (
        <g>
          {/* Wire leads */}
          <line x1="-30" y1="0" x2="-18" y2="0" stroke="#111111" strokeWidth="1.5" />
          <line x1="18" y1="0" x2="30" y2="0" stroke="#111111" strokeWidth="1.5" />
          {/* Zig-zag resistor body */}
          <path
            d="M -18 0 L -14 -7 L -8 7 L -2 -7 L 4 7 L 10 -7 L 14 7 L 18 0"
            fill="none"
            stroke="#111111"
            strokeWidth="1.8"
          />
          <text x="0" y="-12" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
          <text x="0" y="18" fill="#555555" fontSize="10" textAnchor="middle">
            {value}
          </text>
        </g>
      );

    case "capacitor":
      return (
        <g>
          <line x1="-30" y1="0" x2="-6" y2="0" stroke="#111111" strokeWidth="1.5" />
          <line x1="6" y1="0" x2="30" y2="0" stroke="#111111" strokeWidth="1.5" />
          {/* Parallel plates */}
          <line x1="-6" y1="-14" x2="-6" y2="14" stroke="#111111" strokeWidth="2.5" />
          <line x1="6" y1="-14" x2="6" y2="14" stroke="#111111" strokeWidth="2.5" />
          <text x="0" y="-18" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
          <text x="0" y="24" fill="#555555" fontSize="10" textAnchor="middle">
            {value}
          </text>
        </g>
      );

    case "diode":
      return (
        <g>
          <line x1="-30" y1="0" x2="-12" y2="0" stroke="#111111" strokeWidth="1.5" />
          <line x1="12" y1="0" x2="30" y2="0" stroke="#111111" strokeWidth="1.5" />
          {/* Triangle anode */}
          <polygon points="-12,-10 -12,10 12,0" fill="#111111" />
          {/* Bar cathode */}
          <line x1="12" y1="-10" x2="12" y2="10" stroke="#111111" strokeWidth="2" />
          <text x="0" y="-14" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
          <text x="0" y="22" fill="#555555" fontSize="10" textAnchor="middle">
            {value}
          </text>
        </g>
      );

    case "ic8":
      return (
        <g>
          {/* IC Body Box */}
          <rect x="-35" y="-40" width="70" height="80" fill="#ffffff" stroke="#111111" strokeWidth="1.8" rx="2" />
          {/* Top notch */}
          <path d="M -8 -40 A 8 8 0 0 0 8 -40" fill="none" stroke="#111111" strokeWidth="1.5" />
          {/* Pin lines */}
          {[-30, -10, 10, 30].map((py, idx) => (
            <g key={idx}>
              <line x1="-35" y1={py} x2="-25" y2={py} stroke="#111111" strokeWidth="1.2" />
              <text x="-20" y={py + 3.5} fill="#666666" fontSize="9">
                {idx + 1}
              </text>
              <line x1="25" y1={py} x2="35" y2={py} stroke="#111111" strokeWidth="1.2" />
              <text x="14" y={py + 3.5} fill="#666666" fontSize="9">
                {8 - idx}
              </text>
            </g>
          ))}
          <text x="0" y="-5" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
          <text x="0" y="10" fill="#666666" fontSize="9" textAnchor="middle">
            {value}
          </text>
        </g>
      );

    case "header2":
      return (
        <g>
          <rect x="-20" y="-20" width="40" height="40" fill="#ffffff" stroke="#111111" strokeWidth="1.5" rx="2" />
          <circle cx="0" cy="-8" r="4" fill="none" stroke="#111111" strokeWidth="1.5" />
          <circle cx="0" cy="8" r="4" fill="none" stroke="#111111" strokeWidth="1.5" />
          <line x1="4" y1="-8" x2="25" y2="-8" stroke="#111111" strokeWidth="1.2" />
          <line x1="4" y1="8" x2="25" y2="8" stroke="#111111" strokeWidth="1.2" />
          <text x="-30" y="3" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
        </g>
      );

    case "header4":
      return (
        <g>
          <rect x="-20" y="-40" width="40" height="80" fill="#ffffff" stroke="#111111" strokeWidth="1.5" rx="2" />
          {[-30, -10, 10, 30].map((py, idx) => (
            <g key={idx}>
              <circle cx="0" cy={py} r="4" fill="none" stroke="#111111" strokeWidth="1.5" />
              <line x1="4" y1={py} x2="25" y2={py} stroke="#111111" strokeWidth="1.2" />
              <text x="-10" y={py + 3} fill="#666666" fontSize="9">
                {idx + 1}
              </text>
            </g>
          ))}
          <text x="0" y="-46" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
        </g>
      );

    case "to220":
      return (
        <g>
          <rect x="-22" y="-18" width="44" height="36" fill="#ffffff" stroke="#111111" strokeWidth="1.5" rx="2" />
          <line x1="-22" y1="0" x2="-25" y2="0" stroke="#111111" strokeWidth="1.5" />
          <line x1="22" y1="0" x2="25" y2="0" stroke="#111111" strokeWidth="1.5" />
          <line x1="0" y1="18" x2="0" y2="25" stroke="#111111" strokeWidth="1.5" />
          <text x="0" y="-3" fill="#111111" fontSize="10" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
          <text x="0" y="9" fill="#666666" fontSize="8" textAnchor="middle">
            {value}
          </text>
        </g>
      );

    case "vcc":
      return (
        <g>
          <line x1="0" y1="0" x2="0" y2="15" stroke="#cc0000" strokeWidth="1.8" />
          <polygon points="0,-12 -8,0 8,0" fill="#cc0000" />
          <text x="0" y="-16" fill="#cc0000" fontSize="11" fontWeight="bold" textAnchor="middle">
            VCC
          </text>
        </g>
      );

    case "gnd":
      return (
        <g>
          <line x1="0" y1="-15" x2="0" y2="0" stroke="#111111" strokeWidth="1.8" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke="#111111" strokeWidth="2" />
          <line x1="-8" y1="4" x2="8" y2="4" stroke="#111111" strokeWidth="1.6" />
          <line x1="-4" y1="8" x2="4" y2="8" stroke="#111111" strokeWidth="1.2" />
          <text x="0" y="20" fill="#555555" fontSize="10" fontWeight="bold" textAnchor="middle">
            GND
          </text>
        </g>
      );

    default:
      return (
        <g>
          <rect x="-25" y="-20" width="50" height="40" fill="#ffffff" stroke="#111111" strokeWidth="1.5" />
          <text x="0" y="4" fill="#111111" fontSize="11" fontWeight="bold" textAnchor="middle">
            {ref}
          </text>
        </g>
      );
  }
}

/* ── STYLES ────────────────────────────────────────────────────────── */

const editorContainer: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  background: "#f4f8fc",
  overflow: "hidden",
  userSelect: "none",
};

const toolbar: React.CSSProperties = {
  height: 44,
  background: "#ffffff",
  borderBottom: "1px solid #d2e0ee",
  display: "flex",
  alignItems: "center",
  padding: "0 14px",
  gap: 8,
  zIndex: 10,
  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
};

const toolGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const toolBtn: React.CSSProperties = {
  background: "#f4f8fc",
  border: "1px solid #d2e0ee",
  borderRadius: 4,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#2c3e50",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const activeToolBtn: React.CSSProperties = {
  background: "#e3f2fd",
  borderColor: "#2196f3",
  color: "#1976d2",
};

const vSep: React.CSSProperties = {
  width: 1,
  height: 22,
  background: "#d2e0ee",
  margin: "0 4px",
};

const symbolGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const toolbarLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#74889c",
  marginRight: 4,
};

const symbolBtn: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d2e0ee",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 500,
  color: "#163354",
  cursor: "pointer",
};

const syncBtn: React.CSSProperties = {
  background: "#e8f5e9",
  border: "1px solid #81c784",
  color: "#2e7d32",
  borderRadius: 4,
  padding: "5px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const openPcbBtn: React.CSSProperties = {
  background: "#1e88e5",
  border: "none",
  color: "#ffffff",
  borderRadius: 4,
  padding: "5px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const canvasWrap: React.CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
  background: "#f0f4f8",
};
