---
session: "annotations-thickness-preview"
timestamp: "2026-04-27T16:30:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "chrome-devtools"]
---

## Human

Two follow-ups on the annotation tool:

1. The pen strokes only appear after pointer-up; they should render live during
   the drag (with undo/redo still pinned to mouse-up granularity).
2. Add a way to choose pen thickness.

## Assistant

### Key decisions

- **Migrated to `Line2`/`LineGeometry`/`LineMaterial`** from
  `three/addons/lines/...`. `THREE.Line` + `LineBasicMaterial.linewidth` is
  hard-capped to 1px in WebGL, so a thickness control would have done
  nothing visible. `Line2` uses a screen-space shader to draw lines of
  arbitrary pixel width.
- **Live preview now uses the same `strokeToLine2()` builder as committed
  strokes**, so what the user sees while dragging is exactly what they get
  on commit. The preview line is mutated in place via `setLine2Points()`
  on every accepted pointer sample (no per-sample allocation).
- **Width is per-stroke**, recorded on commit. Changing the active width
  doesn't retroactively resize existing strokes.
- **Resolution-aware materials.** `LineMaterial` needs the target render's
  pixel resolution to compute screen-space widths. Live overlay tracks the
  viewport canvas size via `setLiveResolution()` driven from the
  `ResizeObserver`. Each offscreen render path
  (`renderViewsToContainer`, `renderCompositeCanvas`, `renderSingleView`,
  `renderElevationsToContainer`) builds a fresh strokes group at its own
  size (300px tiles, 500px renderView default, etc.).
- **Undo/redo granularity unchanged**: `addStroke()` still fires only on
  pointer-up. The preview line lives outside the strokes store, so undo
  removes the last *committed* stroke even if a drag is in progress.

### UI additions

- Width row in the picker panel: XS/S/M/L preset buttons (2/4/7/12 px) with
  thickness-mimicking dot icons.
- Console API: `setAnnotationWidth(px)` and `getAnnotationWidth()`. The
  setter validates the range (0.5..64).

### Verified manually

- Mid-drag: live preview renders during pointermove (~2500+ pink pixels
  before commit).
- After commit: stroke remains rendered; preview is disposed.
- `renderView()` at angles where the surface is visible shows the thicker
  line (~1200 pink at 8px width vs ~50 at 1px previously).
- Undo removes the most recent committed stroke and refreshes panes.
- `setAnnotationWidth(2)` then `getAnnotationWidth()` round-trips.
- `npm run build` passes with no TypeScript errors.
