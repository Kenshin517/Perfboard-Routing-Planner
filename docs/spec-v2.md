# Spec v2 — Perfboard Routing Planner (EasyEDA-style polish)

> Lanjutan dari `docs/spec.md` (v1 sudah selesai). v2 = polish/UX ala EasyEDA +
> beberapa perbaikan yang muncul dari pemakaian nyata. Tetap **perfboard planner**,
> BUKAN EDA penuh. Tetap 100% client-side, di-host statis di VPS.
> Disusun dari sesi grilling 2026-10-23, bukan asumsi baru.

---

## Problem Statement

v1 jalan, tapi dari pemakaian ada beberapa yang bikin kurang nyaman dibanding
mewiring di KiCad:

1. **Kaki/pin komponen gak jelas.** Komponen cuma kotak + dot tanpa nomor pin, jadi
   pas routing bingung mana pin 1, pin 2, dan ini nyambung ke net apa.
2. **Board default belum persis real life.** Perfboard fisik (Mascot PCB002, dijual
   2 keping) punya **lubang mounting non-plated di tiap sudut** yang belum dimodelkan.
3. **Rasa tool masih "mentah"** dibanding EasyEDA — toolbar tombol teks berejer, grid
   kasar, gak ada panel properti buat edit komponen.
4. **3D** perlu enak dilihat tapi Sandy sempat khawatir berat (ternyata salah paham:
   yang berat itu import model CAD, bukan render 3D procedural).
5. Perlu **jalan di VPS Oracle free tier**.

## Solution

Poles perfboard planner sampai "kerasa EasyEDA" tanpa jadi EDA:

- Pad komponen digambar jelas (ring tembaga + nomor pin), tooltip `ref.pin — net`,
  body semi-transparan — routing jadi sejelas KiCad.
- Board default real-life: 25×29 (A–Y × 1–29) + 4 mounting hole non-connectable.
- UX upgrade bertahap: toolbar rapi, grid/snapping halus, panel properti, library
  browser, theme.
- 3D three.js dipoles (lighting/material/shadow/orbit) — tetap enteng (lazy-load,
  model procedural).
- Deploy statis (`next export` → nginx) di VPS Oracle free tier.

## User Stories

**Pin/pad clarity**
1. Sebagai user, saya ingin tiap pad komponen tampil beda dari lubang kosong (ring
   tembaga), supaya tahu mana yang kaki komponen.
2. Sebagai user, saya ingin nomor pin tampil di pad saat zoom dekat atau hover,
   supaya tahu pin 1/2/3 yang mana tanpa ribet saat zoom jauh.
3. Sebagai user, saya ingin tooltip `U1.3 — GND` saat hover pad, supaya tahu pin itu
   net apa.
4. Sebagai user, saya ingin body komponen semi-transparan, supaya kaki-kakinya tetap
   kelihatan di bawahnya.
5. Sebagai user, saya ingin pad net yang sedang saya route tetap di-highlight (sudah
   ada di v1), supaya jelas tujuannya.

**Board real-life + mounting holes**
6. Sebagai user, saya ingin board default 25×29 (A–Y × 1–29) sesuai perfboard fisik.
7. Sebagai user, saya ingin 4 lubang mounting di tiap sudut (di tengah klaster 2×2:
   1A/1B/2A/2B, 1X/1Y/2X/2Y, 28A/28B/29A/29B, 28X/28Y/29X/29Y), supaya layout cocok
   dengan board fisik.
8. Sebagai user, saya ingin mounting hole TIDAK bisa ditaruhi komponen dan TIDAK bisa
   dilewati trace (obstacle), supaya rencana realistis.
9. Sebagai user, saya ingin mounting hole tampil beda (putih/abu, lebih besar),
   supaya gampang dibedakan dari pad biasa.
10. Sebagai user, saya ingin mounting hole ikut tercetak di PDF 1:1, supaya panduan
    cetak cocok dengan board fisik.

**EasyEDA-style UX**
11. Sebagai user, saya ingin toolbar rapi (ikon + tooltip, dikelompokkan), supaya
    gak ngeliat deretan tombol teks.
12. Sebagai user, saya ingin grid halus ala EasyEDA + koordinat ikut kursor, supaya
    penempatan presisi dan enak dilihat.
13. Sebagai user, saya ingin panel properti (klik komponen/trace → edit ref, value,
    rotasi, layer di panel kanan), supaya edit cepat tanpa cari-cari tombol.
14. Sebagai user, saya ingin library browser (sidebar komponen dengan search +
    preview), supaya cari part gampang.
15. Sebagai user, saya ingin theme (warna/spacing/font) yang lebih polished.

**3D**
16. Sebagai user, saya ingin 3D yang enak dilihat (lighting, material, bayangan,
    orbit smooth) tapi tetap enteng.

**Deploy**
17. Sebagai user, saya ingin app bisa di-build jadi statis dan di-serve nginx di VPS
    Oracle free tier, tanpa backend.

## Implementation Decisions

**Seam (tetap satu):** semua logika baru masuk `BoardEngine` (headless, tested);
view (canvas/3D/panel/toolbar) tetap tipis.

**Board & mounting holes**
- `BoardConfig` tambah `mountingHoles: HoleCoord[]` (atau turunan dari preset). Default
  board = 25×29 dengan 4 mounting hole di koordinat tengah klaster sudut 2×2
  (mis. antara 1A/1B/2A/2B → titik tengah ≈ col 0.5, row 0.5; disimpan sebagai posisi
  sub-grid atau hole terdekat yang ditandai `mounting`).
- Keputusan presisi: mounting hole disimpan sebagai **set HoleCoord yang ditandai
  non-usable** (model paling sederhana: hole tertentu jadi mounting). Posisi final
  dikonfirmasi saat implementasi dengan melihat board fisik; defaultnya 4 sudut.
- Engine: `isMountingHole(coord)`, dan `hasUsableHole(coord)` = `hasHole && !mounting`.
  `addComponent`/`place`, router (`previewRoute`/`routeWaypoints`/`autoroute`), dan
  `foreignPadHoles` memperlakukan mounting hole sebagai **blocked**.

**Pin/pad rendering**
- Canvas: gambar pad komponen sebagai ring (beda dari hole kosong). Nomor pin di-draw
  saat `step >= threshold` atau saat hover. Tooltip `ref.pin — net` via state hover di
  page (engine sudah punya `pinAt`/`netAt`). Body komponen alpha diturunkan.

**Toolbar / grid / properties (UX)**
- Toolbar: komponen React baru, ikon (inline SVG) + `title` tooltip, dikelompokkan
  (file, routing, view, export). Tetap manggil handler yang sama di `page.tsx`.
- Grid: garis tipis opsional di Canvas; HUD koordinat kursor (`H7`) di pojok.
- Panel properti: komponen React kanan yang baca objek terpilih dari engine dan panggil
  `mutate(...)` (undo-aware). Gak ada logika domain baru di panel.
- Library browser: sidebar dengan search filter atas `engine.listFootprints()` +
  thumbnail (bisa reuse mini-canvas atau SVG sederhana).

**3D polish**
- `Perfboard3D`: tambah directional light + ambient tuning, `MeshStandardMaterial`
  yang lebih baik, ground shadow (atau contact shadow sederhana), damping pada
  OrbitControls. Tetap lazy-load. Mounting hole digambar sebagai lubang tembus.

**Deploy**
- `next.config.mjs`: `output: "export"`. `npm run build` → `out/`. CI (opsional)
  meng-upload `out/` sebagai artifact. Dokumen `docs/deploy.md`: nginx serve `out/`,
  catatan build di luar VPS kalau instance AMD 1GB (OOM), HTTPS via certbot.

## Testing Decisions

- Test tetap nembak **`BoardEngine`** (behavior eksternal), bukan UI. Pola sama seperti
  `src/engine/*.test.ts` yang sudah ada.
- Modul/behaviour yang diuji:
  - **mounting holes**: default board punya 4 mounting hole di sudut; `isMountingHole`
    benar; `addComponent`/`place` menolak atau melewati mounting hole; router tidak
    melewati mounting hole; `hasUsableHole` benar.
  - **pad/pin resolution**: tetap pakai test `pinPositions`/`pinAt`/`netAt` yang ada
    (rendering pad tidak diunit-test — itu UI).
- UI (toolbar, panel, grid, library, 3D) **tidak** diunit-test; Playwright smoke
  (`e2e/smoke.spec.ts`) diperluas ringan untuk memastikan panel/toolbar baru tidak
  crash.

## Out of Scope

- Jadi **EDA penuh** (schematic capture, PCB design umum) — ditolak eksplisit.
- **Backend / akun / project cloud / share-link** — tetap client-side; "VPS" = hosting
  statis saja.
- **Import model 3D CAD/STEP asli** — tetap model procedural (yang bikin berat justru
  ini).
- **Multi-board** dalam satu project — "2 keping" hanya kemasan; satu board per project.
- **Auto-placement**, Gerber, format netlist baru di luar yang sudah didukung.

## Further Notes

- **Oracle free tier:** runtime nginx enteng; `next build` bisa OOM di AMD 1GB →
  build di lokal/CI lalu upload `out/`. ARM Ampere aman build di VPS.
- **Posisi mounting hole** dikonfirmasi lagi saat implementasi (center 2×2 vs pad
  tertentu) dengan referensi board fisik Sandy.
- **Urutan build** (disepakati): 1) pin/pad clarity → 2) board+mounting holes →
  3) toolbar+grid → 4) panel properti → 5) 3D polish → 6) library browser+theme →
  7) deploy statis. Tiap blok = commit terpisah, test ijo, push ke `main`.
- Semua perubahan lewat workflow repo biasa; `main` sudah protected (PR + CI), tapi
  untuk sesi solo ini commit langsung ke `main` sesuai permintaan Sandy.
