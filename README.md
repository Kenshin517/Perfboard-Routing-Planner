# Perfboard Routing Planner

Tool web untuk mempercepat planning wiring di **dot perfboard (PCB bolong)** dengan
meminimalkan jumper. Lihat `docs/spec.md` untuk spec lengkap.

> **Status:** v1 lengkap (tiket 01–10). Import netlist → place komponen → manual/auto
> routing dengan deteksi crossing & jumper → build-list → export PDF 1:1 + PNG → 3D view.
> 58 engine test hijau.

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
| `npm run lint`      | ESLint (next/core-web-vitals)                 |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm test`          | Jalanin test engine (Vitest)                  |
| `npm run test:watch`| Test watch mode                               |
| `npm run test:e2e`  | Playwright smoke (`npx playwright install` dulu) |
| `npm run check`     | lint + typecheck + test (dipaksa pre-commit)  |

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

## Alur pakai

1. **Import netlist** (KiCad `.net` atau XML) → part masuk tray **"Unplaced"**; klik tiap part lalu taruh di board (placement manual, sesuai spec). Atau ambil part baru dari palette.
2. Atur penempatan: drag geser, R rotate, Del hapus. Airwire (garis putus hijau) nunjukin koneksi yang belum di-route.
3. **Route** (free-draw): klik Route → klik **lubang demi lubang** (jalur ngikut grid otomatis), **Enter / double-click** = selesai, Esc = batal. Atau **Autoroute** sekali klik.
4. Crossing bare-wire ditandai **merah**; klik **Jumper-kan crossings** atau pilih trace → `→ jumper`. Counter nunjukin trace/jumper/crossing.
5. **Flip** (Top/Bottom) buat lihat sisi solder (mirror).
6. **Build list** = resep rakit teks. **PDF** = cetak 1:1 (2 halaman: placement + routing mirror, ada kotak kalibrasi 50mm). **3D** = preview box komponen.
7. Auto-save ke browser; **Export/Import** `.json` buat backup/pindah device.

## Roadmap tiket (semua ✅)

1. ✅ Board skeleton
2. ✅ Place components dari library footprint
3. ✅ Persistence: autosave + export/import JSON
4. ✅ Import netlist + matching library + ratsnest
5. ✅ Manual routing (click pad-to-pad) + flip view
6. ✅ Crossing detection + layer jumper + counter
7. ✅ Build-list teks
8. ✅ Export PDF 1:1 + PNG
9. ✅ Autoroute (greedy A\* + promote-to-jumper)
10. ✅ 3D view (box primitive, three.js)

## Dependencies

`next`, `react`, `jspdf` (export PDF, lazy-loaded), `three` (3D, lazy-loaded). Dev: `typescript`, `vitest`, `@types/*`.
