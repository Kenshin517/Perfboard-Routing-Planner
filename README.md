<div align="center">

# Perfboard Routing Planner

**Rencanakan wiring di dot perfboard (PCB bolong) dan minimalkan jumper — langsung di browser.**

[![CI](https://github.com/Kenshin517/Perfboard-Routing-Planner/actions/workflows/ci.yml/badge.svg)](https://github.com/Kenshin517/Perfboard-Routing-Planner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-74%20passing-brightgreen)

</div>

---

Merakit rangkaian di dot perfboard itu paling makan waktu di bagian **mikirin jalur
bawah board** biar rapi dan sesedikit mungkin jumper. Tool ini memindahkan planning itu
ke layar: import netlist dari KiCad, taruh komponen di peta lubang, tarik jalur (manual
atau autoroute), lihat peringatan crossing, lalu cetak panduan rakit 1:1 buat ditempel
di board fisik.

## ✨ Fitur

- **Import netlist KiCad** — 3 format: XML, `.net` (S-expr), dan OrcadPCB2 (auto-detect)
- **Penempatan komponen** dari library footprint (grid-hole units) + rotate/drag/hapus
- **Routing** free-draw lubang-per-lubang (jalur ngikut grid) + **Autoroute** greedy
- **2 layer** — bottom-copper (bare, gak boleh nyilang) & jumper (boleh), deteksi
  crossing otomatis + counter
- **Ratsnest guidance** — pas routing, net & pad tujuan di-highlight (ala KiCad)
- **3D view** — model realistis per komponen (TO-220, LED, DIP, header, resistor, ESP32)
- **Export** — build-list teks, **PDF 1:1** (placement + routing mirror + kotak kalibrasi),
  PNG
- **Undo/redo** (Ctrl+Z/Y), autosave ke browser, export/import `.json`

## 🚀 Mulai

```bash
git clone https://github.com/Kenshin517/Perfboard-Routing-Planner.git
cd Perfboard-Routing-Planner
npm install
npm run dev          # buka http://localhost:3000
```

### Alur pakai singkat

1. **Import netlist** (atau ambil part dari palette) → part masuk tray **Unplaced** →
   klik tiap part, taruh di board.
2. Atur: drag geser, `R` rotate, `Del` hapus. Airwire putus-putus = koneksi belum
   di-route.
3. **Route** → klik lubang demi lubang (jalur ngikut grid) → `Enter` / double-click
   selesai. Net & pad tujuan ke-highlight. Atau **Autoroute**.
4. Crossing bare-wire ditandai **merah** → **Jumper-kan crossings** atau ubah layer
   trace manual.
5. **Flip** Top/Bottom buat sisi solder, **3D** buat cek penempatan.
6. **Build list** + **PDF 1:1** (cetak Actual Size, ukur kotak kalibrasi 50mm) buat
   panduan rakit.

> Shortcut: `Ctrl+Z`/`Ctrl+Y` undo/redo · `R` rotate · `Del` hapus · `F` flip ·
> `Esc` batal · scroll zoom · drag pan.

## 🧩 Export netlist dari KiCad

Eeschema → **Tools → Generate Netlist File** (atau File → Export → Netlist). Tab
**KiCad** ngasih info paling lengkap; **OrcadPCB2** juga didukung. Simpan `.net`, lalu
**Import netlist** di app. Assign footprint dulu di KiCad biar bentuk & model 3D-nya
paling akurat (part tanpa footprint = generic).

## 🛠 Scripts

| Perintah             | Fungsi                                              |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Dev server (hot reload)                             |
| `npm run build`      | Production build                                    |
| `npm run lint`       | ESLint (next/core-web-vitals)                        |
| `npm run typecheck`  | `tsc --noEmit`                                       |
| `npm test`           | Test engine (Vitest)                                |
| `npm run test:e2e`   | Playwright smoke (`npx playwright install` dulu)    |
| `npm run check`      | lint + typecheck + test (dipaksa husky pre-commit)  |

## 🏗 Arsitektur

Satu **seam** = `src/engine/BoardEngine.ts` — headless, megang semua domain logic &
state, **tanpa rendering**. Semua test nembak ke sini; UI cuma view tipis di atasnya.
Detail & aturan "di mana naruh apa" ada di [`CLAUDE.md`](./CLAUDE.md).

```
src/
  engine/       # BoardEngine (the seam) + coordinates, footprints, netlist,
                # router, crossings, printGeometry — semua pure + ketes
  components/   # PerfboardCanvas (2D), Perfboard3D, componentModels
  export/       # pdf, png
  lib/          # theme (warna), display (flip/mirror geometry)
  app/          # page.tsx (toolbar + canvas), layout, globals.css
docs/spec.md    # spec v1
e2e/            # Playwright smoke test
```

**Stack:** Next.js 14 · TypeScript · Canvas 2D · three.js (3D, lazy) · jsPDF (lazy) ·
Vitest · ESLint · Playwright · no backend (semua client-side).

## 🌐 Deploy

App statis (`output: export`) — `npm run build` menghasilkan folder `out/` yang
di-serve nginx tanpa Node runtime. Panduan lengkap (nginx, HTTPS, catatan Oracle
free-tier) ada di [`docs/deploy.md`](./docs/deploy.md).

## 🤝 Berkontribusi

Baca [`CONTRIBUTING.md`](./CONTRIBUTING.md). Singkatnya: bikin branch `feat/...` dari
`main`, `npm run check` harus hijau, buka Pull Request — CI nge-test hasil merge-nya
otomatis sebelum di-merge.

## 📄 Lisensi

[MIT](./LICENSE) © 2026 Sandy (Kenshin517)
