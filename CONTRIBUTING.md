# Contributing

Panduan kerja bareng di repo ini. Dibuat ringkas biar gampang diikutin.

## Alur kerja (GitHub Flow)

`main` **selalu stabil** dan **dilindungi** — gak ada yang push langsung ke
situ. Semua perubahan lewat **Pull Request**.

```
1. Sync main terbaru
   git checkout main
   git pull origin main

2. Bikin branch fitur dari main
   git checkout -b feat/nama-fitur      # atau fix/nama-bug

3. Kerja, commit kecil-kecil yang jelas
   npm run check                        # WAJIB hijau sebelum commit
   git commit -m "feat: ..."

4. Push branch-mu
   git push -u origin feat/nama-fitur

5. Buka Pull Request ke main di GitHub
   - CI jalan otomatis (lint + typecheck + test + build)
   - Minta review ke partner
   - Merge setelah CI hijau + di-approve
```

**Soal "test sebelum merge":** gak perlu branch test manual. Begitu PR dibuka,
**GitHub Actions** nge-test hasil merge branch-mu ke `main` otomatis (lihat
`.github/workflows/ci.yml`). Kalau merah, PR ketahan. Itu jaring pengamannya.

## Penamaan branch

- `feat/...` — fitur baru
- `fix/...` — bug fix
- `refactor/...` — rapi-rapi tanpa ubah perilaku
- `docs/...` / `chore/...` — dokumentasi / tooling

## Commit message

Pakai gaya [Conventional Commits](https://www.conventionalcommits.org):
`type: ringkasan singkat`, mis. `feat: free-draw routing`, `fix: ratsnest
cross-net`. Satu commit = satu perubahan logis.

## Sebelum commit / PR

`npm run check` harus hijau. Hook **pre-commit** (husky) otomatis
jalanin ini; jangan di-skip. Isinya:

| Perintah            | Fungsi                         |
| ------------------- | ------------------------------ |
| `npm run lint`      | ESLint                         |
| `npm run typecheck` | `tsc --noEmit`                 |
| `npm test`          | Test engine (Vitest)           |
| `npm run test:e2e`  | Playwright smoke (opsional)    |

## Aturan kode

Baca [`CLAUDE.md`](./CLAUDE.md) — ini kontrak arsitektur. Inti:

- **Satu seam:** semua logika & state di `src/engine/BoardEngine.ts` (headless,
  no rendering). Komponen/export cuma view tipis di atasnya.
- **Test nembak engine**, bukan UI. Logika baru taruh di engine biar ketes.
- Warna → `src/lib/theme.ts`. Geometri flip/mirror → `src/lib/display.ts`.
  Footprint → `src/engine/footprints.ts`. Jangan sebar-sebar.

## Butuh bantuan?

Buka **Issue** (ada template bug / feature), atau diskusi di PR.
