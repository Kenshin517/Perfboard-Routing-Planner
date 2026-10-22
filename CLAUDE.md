# CLAUDE.md — steering for agents

Web tool to plan wiring on dot perfboard (PCB bolong) and minimise jumpers.
Next.js 14 + TypeScript, **no backend**. Read `docs/spec.md` for the full spec.

## Architecture — one seam

`src/engine/BoardEngine.ts` is the **single headless seam**: it owns all state
and domain logic with **no rendering**. Every renderer (`src/components/*`,
`src/export/*`) is a thin view that reads from it. Add logic to the engine, not
to components.

- **Tests target the engine only** (`src/engine/*.test.ts`). The UI/canvas is
  not unit-tested. Keep new logic in the engine so it stays testable.
- The page holds the engine in a ref + a `rev` counter to trigger re-renders.
  Mutations go through engine methods; the page wraps them in `mutate()` so they
  land in the **undo** history. Don't mutate state outside the engine.

## Where things live (edit here, not scattered)

- **Add a footprint** → `src/engine/footprints.ts` (`DEFAULT_FOOTPRINTS` +
  `refPrefixFor`). For netlist import mapping also update `mapKicadFootprint` in
  `src/engine/netlist.ts`. Offsets are in **grid-hole units**.
- **Colors** → `src/lib/theme.ts` (`palette` for screen, `printPalette` for
  PDF, `hexToInt` for three.js). Never hardcode hex in a renderer.
- **Flip/mirror + component rectangle** → `src/lib/display.ts` (`mirrorCol`,
  `screenRectFromBounds`, `boundsOf`). Component bbox → `engine.componentBounds`.
- **mm / printing** → `src/engine/printGeometry.ts` + `src/export/pdf.ts`.
  Everything else is hole-integers; convert to mm **only** here.

## Invariants

- Two layers: `bottom-copper` (bare, must not cross) and `jumper` (insulated,
  may cross). `crossings()` flags different-net bare traces that touch.
- `previewRoute`/`routePadToPad`/`autoroute` **block foreign-net pads** — a bare
  wire can't run through another component's pin.
- Imported netlist parts start **unplaced** (`placed: false`); renderers,
  ratsnest, crossings and build-list use `getPlacedComponents()` / placed pins.
- `ratsnest()` only unions pins of the **same net** (via shared holes / traces).

## Before committing

Run `npm run check` (lint → typecheck → test). A husky pre-commit hook enforces
it. Keep each commit to one logical change and reference the spec/ticket.
`next build` is slow — run it at milestones, not every change.
