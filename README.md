# Perfboard Routing Planner

Tool web untuk mempercepat planning wiring di **dot perfboard (PCB bolong)** dengan
meminimalkan jumper. Lihat `docs/spec.md` untuk spec lengkap.

> **Status:** Ticket 01 — board skeleton. Scaffold + `BoardEngine` seam + render grid
> Canvas + test seam. Fitur lain (import netlist, placement, routing, autoroute, dll.)
> menyusul per tiket.

## Jalanin lokal

```bash
npm install
npm run dev
# buka http://localhost:3000
```

Yang bisa dilihat sekarang: grid lubang perfboard dengan label koordinat (A, B, C… /
1, 2, 3…), bisa **scroll buat zoom**, **drag buat pan**, atur jumlah **Cols/Rows**, dan
**Reset view**.

## Scripts

| Perintah            | Fungsi                                        |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server (hot reload)                       |
| `npm run build`     | Production build                              |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm test`          | Jalanin test (Vitest)                         |
| `npm run test:watch`| Test watch mode                               |

## Arsitektur (penting buat tiket berikutnya)

Satu **seam** = `src/engine/BoardEngine.ts` — headless, megang semua domain logic &
state, **tanpa rendering**. Semua test nembak ke sini. UI (`src/components/`,
`src/app/`) cuma view tipis di atas engine. Tambahin fitur = tambah method/modul di
`src/engine/`, bukan nyampur logic ke komponen React.

```
src/
  engine/
    types.ts            # BoardConfig, HoleCoord, BoardState (satuan grid-lubang)
    coordinates.ts      # col/row <-> label "H7" (single source of truth)
    BoardEngine.ts      # THE seam: createBoard, getHoles, hasHole, labelAt
    *.test.ts           # test perilaku eksternal engine
  components/
    PerfboardCanvas.tsx # render grid + pan/zoom
  app/
    page.tsx            # toolbar + canvas
    layout.tsx, globals.css
docs/
  spec.md               # spec v1
```

## Roadmap tiket

1. ✅ **Board skeleton** (ini)
2. Taruh komponen manual dari library footprint
3. Persistence: autosave + export/import JSON
4. Import netlist + matching library + ratsnest
5. Manual routing (click pad-to-pad) + flip view
6. Crossing detection + layer jumper + counter
7. Build-list teks
8. Export PDF 1:1 + PNG
9. Autoroute (greedy maze/A\* + promote-to-jumper)
10. [Fase 2] 3D view (box primitive)
