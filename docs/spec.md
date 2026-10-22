# Spec — Perfboard Routing Planner

> Tool web buat mempercepat planning wiring di dot perfboard (PCB bolong) dengan meminimalkan jumper.
> Status: spec v1, belum ada kode. Disusun dari sesi grilling, bukan asumsi baru.

---

## Problem Statement

Pas merakit rangkaian di dot perfboard (PCB bolong — tiap lubang pad terisolasi, pitch 2.54mm), bagian paling makan waktu adalah **mikirin jalur di bawah board** supaya koneksi antar komponen rapi dan sesedikit mungkin pakai jumper. Sekarang ini dikerjain di kepala / corat-coret kertas: lambat, gampang salah, dan sering baru ketahuan jalurnya nabrak/nyilang pas udah separuh nyolder. Skematik biasanya sudah ada (di KiCad), tapi dari skematik ke "resep rakit fisik di perfboard" itu lompatan manual yang capek.

## Solution

Sebuah web app (personal tool) yang:
1. Meng-import **netlist** dari KiCad (apa nyambung ke apa), bukan layout.
2. Membiarkan user menaruh komponen di atas peta lubang perfboard 2D.
3. Membantu menarik jalur di bawah board — manual (click pad-to-pad, auto-path) maupun **autoroute greedy** — sambil **memperingatkan kalau jalur telanjang saling menyilang** dan **menghitung jumlah jumper**.
4. Menghasilkan **build-list teks** ("resep rakit") + **cetakan PDF 1:1** yang bisa ditumpuk di atas board fisik sebagai panduan naruh komponen & nyolder.

Goal realistis: **minimize jumper + percepat planning**, BUKAN zero jumper (mustahil secara planaritas untuk netlist sembarang di satu sisi).

## User Stories

1. Sebagai user, saya ingin meng-import file **KiCad XML netlist**, supaya daftar komponen + koneksinya masuk tanpa input ulang manual.
2. Sebagai user, saya ingin tiap komponen di netlist dicocokkan ke **footprint di library internal** (pola lubang + mapping pin), supaya app tahu komponen itu makan lubang mana saja.
3. Sebagai user, saya ingin kalau ada part yang footprint-nya belum dikenal, saya bisa **mendefinisikan polanya manual**, supaya import tetap bisa lanjut.
4. Sebagai user, saya ingin mengatur **ukuran board** (jumlah kolom × baris lubang), supaya cocok dengan perfboard fisik yang saya punya.
5. Sebagai user, saya ingin **menaruh & memindah komponen** di grid lubang (snap ke lubang), supaya penempatan presisi.
6. Sebagai user, saya ingin **merotasi komponen** (0/90/180/270°), supaya orientasi pin bisa diatur.
7. Sebagai user, saya ingin melihat **airwire/ratsnest** (garis bantu koneksi yang belum di-route), supaya tahu apa yang masih harus disambung.
8. Sebagai user, saya ingin menarik jalur manual dengan **klik pad asal → klik pad tujuan**, lalu app otomatis mencari jalur sepanjang grid, supaya cepat dan konsisten.
9. Sebagai user, saya ingin app **menandai merah** saat sebuah jalur telanjang (`bottom-copper`) menyilang jalur telanjang lain, supaya saya tahu itu bakal korslet sebelum nyolder.
10. Sebagai user, saya ingin memindahkan koneksi ke **layer jumper** (boleh menyilang), supaya crossing yang tak terhindarkan bisa diselesaikan dengan kawat ber-isolasi.
11. Sebagai user, saya ingin menekan **autoroute** yang me-route net yang belum tersambung secara greedy (pendek dulu), coba di bottom-copper dulu lalu promote ke jumper kalau buntu, supaya ~80% jalur jadi otomatis.
12. Sebagai user, saya ingin melihat **jumlah total trace & jumper** sebagai skor, supaya bisa membandingkan alternatif layout mana yang lebih sedikit jumper.
13. Sebagai user, saya ingin tombol **flip** untuk melihat board dari **atas (komponen)** vs **bawah (jalur, ter-mirror)**, supaya tampilan cocok dengan apa yang saya lihat saat nyolder.
14. Sebagai user, saya ingin project **auto-tersimpan** (tidak hilang saat refresh), supaya kerjaan aman.
15. Sebagai user, saya ingin **export & import file `.json`**, supaya bisa backup atau pindah device.
16. Sebagai user, saya ingin **build-list teks** berisi seksi Placement (komponen di lubang mana) + seksi Connections (tiap trace/jumper) + ringkasan total, supaya punya panduan rakit langkah demi langkah.
17. Sebagai user, saya ingin **export PDF 1:1 (ukuran mm eksak)** dengan **kotak kalibrasi**, supaya bisa dicetak Actual Size dan diverifikasi pakai penggaris.
18. Sebagai user, saya ingin PDF punya dua view — **Placement guide (dari atas)** dan **Routing guide (dari bawah, ter-mirror)** — supaya satu buat naruh komponen, satu buat nyolder.
19. Sebagai user, saya ingin **export PNG** untuk preview/share cepat (bukan untuk cetak presisi).
20. *(Fase 2)* Sebagai user, saya ingin melihat **representasi 3D** komponen di atas board (box sederhana), supaya tahu posisi fisik & buat estetika.

## Implementation Decisions

**Stack & arsitektur**
- Web app: **Next.js + TypeScript**, **tanpa backend**. State di client (mis. Zustand/context).
- Rendering board: **Canvas 2D** (bukan SVG) — aman saat board makin padat; hit-testing (klik pad) di-handle manual.
- **Satu core engine headless** (`BoardEngine`) memegang seluruh domain logic & state, terpisah penuh dari rendering. (Lihat Testing Decisions.)

**Model board & koordinat**
- Board = grid lubang `cols × rows`, pitch **2.54mm**. Anchor koordinat: pojok (mis. kiri-atas) = (col 0, row 0).
- Satuan internal = **grid-lubang (integer)**, bukan mm. Konversi ke mm hanya di layer export/print.

**Model layer & trace**
- **2 logical layer**:
  - `bottom-copper` — jalur telanjang, **TIDAK boleh saling menyilang** (crossing = korslet).
  - `jumper` — kawat ber-isolasi, **boleh menyilang** apa pun.
- Bridge antar pad vs kawat pad-ke-pad di-**abstraksi jadi "trace"** di v1 (tidak dibedakan dulu).
- Trace = urutan lubang/segmen di grid + atribut `layer` + `net`.

**Footprint library (internal, kurasi)**
- Part didefinisikan sebagai JSON, satuan grid-lubang:
  ```
  {
    "name": "DIP-8",
    "pins": [ { "num": 1, "col": 0, "row": 0 }, ... ],   // offset relatif anchor
    "body": { "w": 2, "h": 4, "height": 3.5 }            // height buat 3D fase-2
  }
  ```
- Mapping `pin.num` dipakai untuk mencocokkan ke pin di netlist.
- Target awal ~10 part yang sering dipakai: DIP IC, pin header, R/C/dioda axial, TO-220, modul ESP32, screw terminal.
- Part tak dikenal → fallback definisi manual. **Tidak** parse footprint KiCad di v1.

**Input netlist**
- Terima **satu format: KiCad XML intermediate netlist**. Parse jadi: daftar komponen (ref, value, footprint) + daftar net (nama + list pin `{ref, pinNum}`).

**Routing engine**
- **Maze router / A\*** di grid lubang, per net.
- Urutan net: **pendek dulu, panjang belakangan**.
- Tiap net: coba route di `bottom-copper` (hindari crossing dengan trace bare lain) → kalau buntu, **auto-promote ke `jumper`**.
- **Rip-up & retry ringan** kalau memungkinkan; kalau tidak, greedy saja.
- Autoroute **routing-only** — **placement tetap manual** (auto-placement out of scope).
- Diposisikan sebagai **helper ~80%**, bukan solver optimal.

**Manual routing**
- Interaksi: **klik pad asal → klik pad tujuan**, app auto-path pakai A\* yang sama, user approve.
- **Live crossing warning** (merah) real-time saat trace bare menyilang trace bare lain.

**Flip**
- Toggle view atas (komponen) ↔ bawah (jalur) = **mirror horizontal** tampilan.

**Persistence**
- **JSON = single source of truth** (board size, komponen+placement+rotasi, trace, netlist ter-embed).
- **Autosave ke IndexedDB** + tombol **export/import `.json`**.

**Build-list output**
- Teks, 2 seksi: **(1) Placement** (`R1 → H5–H7`, `U1 (DIP-8) → B3..E6`), **(2) Connections** per net (`GND: bridge H7→H8→H9`, `jumper B3→M12`), ditutup ringkasan **total trace & jumper**.

**Print / export**
- **PDF dengan dimensi mm eksak** (pitch 2.54mm presisi), instruksi print "100% / Actual Size / no scaling", + **kotak kalibrasi** (mis. garis 50mm) untuk verifikasi penggaris.
- Dua view PDF: **Placement guide** (dari atas) & **Routing guide** (dari bawah, **ter-mirror**).
- **PNG** = preview/share saja, bukan cetak presisi.

## Testing Decisions

- Test hanya **perilaku eksternal** `BoardEngine`, bukan detail internal, dan **bukan** UI/Canvas.
- **Satu seam utama** = `BoardEngine` headless. Modul & contoh assertion perilaku:
  - **netlist-parser**: XML sample → struktur netlist benar (komponen, net, pin-map).
  - **footprint-library**: lookup part → pin offsets benar; part tak dikenal → fallback.
  - **router**: diberi state grid + pad asal/tujuan → path ketemu; **tidak** menyilang di bottom-copper; **promote ke jumper** saat buntu; jumlah jumper sesuai ekspektasi pada kasus yang diketahui.
  - **crossing-detector**: dua trace bare → benar deteksi silang / tidak.
  - **build-list-generator**: state → teks sesuai (termasuk ringkasan hitungan).
  - **serialization**: state → JSON → state (**round-trip** identik).
  - **print-geometry**: state → koordinat mm & skala benar (uji fungsi hitungannya, bukan byte PDF-nya).
- UI: tanpa unit test di v1. **Playwright** untuk e2e happy-path bisa menyusul (kamu sudah familiar).
- Greenfield → belum ada prior art test di codebase; pola di atas jadi acuan pertama.

## Out of Scope

- Jaminan **zero jumper** (mustahil secara planaritas).
- **Auto-placement** komponen (placement manual di v1).
- Export **Gerber** / manufaktur PCB (tidak relevan untuk perfboard).
- Dukungan **>1 format netlist** (hanya KiCad XML dulu).
- **Parsing footprint KiCad** langsung (pakai library internal).
- Import **model 3D realistis** (STEP/glTF) — 3D v-fase-2 cuma box primitive.
- **Backend, auth, multi-user, kolaborasi**.
- PCB tembaga **double-sided** / stripboard (fokus dot perfboard single-sided).

## Further Notes

- **Risiko terbesar = autoroute.** Maze router + constraint non-crossing + promote-ke-jumper itu problem susah (kelas NP-hard untuk optimal). Kalau macet pas eksekusi: app **sudah berguna tanpa autoroute** — manual routing + crossing warning + build-list + print 1:1 saja sudah memotong waktu banyak. Autoroute = bonus, bukan syarat hidup v1.
- **Reality planaritas**: beberapa net memang wajib jumper. Nilai app = memaksimalkan yang lewat bottom-copper tanpa silang, sisanya jumper.
- **Gotcha print**: printer sering auto-scale → kotak kalibrasi wajib. Dan Routing guide **harus ter-mirror**, kalau tidak jalurnya kebalik saat dilihat dari sisi solder.
- **Build order yang disarankan** (biar tiap langkah udah kepake): board grid + placement manual → netlist import + library → manual routing + crossing warning → build-list → PDF export → autoroute → (fase 2) 3D.
- Prior art buat kalibrasi: DIYLC (manual, no autoroute), VeroRoute (autoroute tapi stripboard), Fritzing/Lochmaster. Autoroute non-crossing khusus dot-perfboard = wilayah yang belum digarap serius — peluang sekaligus tanda ini problem susah.
