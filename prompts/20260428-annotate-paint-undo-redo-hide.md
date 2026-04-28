---
session: "annotate-paint-undo-redo-hide"
timestamp: "2026-04-28T00:00:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"]
---

## Human

(1) The annotate panel has Undo but no Redo — accidentally undoing loses
the stroke for good. Add a Redo button. Base the worktree off `staging`.

(2) The paint panel has no undo/redo/hide. Add the same action row to
paint that annotate now has: visibility toggle, undo, redo, clear.

## Assistant

### Key decisions

- **Per-feature redo stacks, not a global history.** The annotate redo
  stack only tracks strokes; the paint redo stack only tracks regions.
  Mixing them would mean one feature's mutations could resurrect the
  other's state, which would surprise the user.
- **Redo stack clears on any non-undo mutation** (new add, clear,
  remove-by-id, deserialize). This keeps redo from re-adding state into
  a context where the user wouldn't expect it — e.g. paint a region,
  undo, paint a different region, then redo would have stitched a stale
  region into the timeline.
- **Visibility is a viewport-only concern.** Exports
  (`hasColorRegions() ? applyTriColors(...) : ...`) keep their colors
  regardless of the Hide button so the user can toggle paint off
  without losing it from saved files. A new
  `applyTriColorsIfVisible()` is the viewport-side variant; the
  original `applyTriColors()` is reserved for export sites.
- **No new top-level toolbar buttons.** All four actions live inside
  the existing picker panels — same pattern annotate already
  established. Buttons grey out when there's nothing to act on so
  users get visual feedback without state guessing.

### Architecture

- `src/annotations/annotations.ts` — added `strokeRedoStack`,
  `redoLastStroke()`, `canRedoStroke()`, `onRedoChange()`. Existing
  mutation paths (`addStroke`, `addText`, `removeAnnotationById`,
  `clearStrokes`, `clearTexts`, `clearAll`, `removeLastAnnotation`,
  `loadFromSerialized`) all call `clearRedoStack()`.
- `src/annotations/annotateUI.ts` — Redo button next to Undo, wired to
  `onRedoChange` for enabled-state toggling.
- `src/color/regions.ts` — symmetric design: `regionRedoStack`,
  `removeLastRegion()`, `redoLastRegion()`, `canRedoRegion()`,
  `onRedoChange()`, plus a visibility flag with `isVisible()`,
  `setVisible()`, `onVisibilityChange()`. New
  `applyTriColorsIfVisible(mesh)` short-circuits to the unmodified
  mesh when paint is hidden.
- `src/color/paintUI.ts` — new action row at the bottom of the picker
  panel: Hide/Show, Undo paint, Redo paint, Clear. Subscribes to
  `onRegionsChange`, `onRedoChange`, and `onVisibilityChange` to keep
  button states in sync.
- `src/main.ts` — viewport call sites (line 471, 1298, 1311, 1321,
  2517, 2885) now use `applyTriColorsIfVisible`. Export call sites
  (870, 1502) keep `applyTriColors` so 3MF/STL/etc. always include
  paint. New `onPaintVisibilityChange` listener re-renders the
  viewport, multiview, and elevations on toggle.

### Verification

- `npm run build` clean (one type error caught & fixed: an unused
  `isPaintVisible` import after refactoring).
- Couldn't drive Chrome DevTools MCP (server not connectable from this
  environment), so left the in-browser exercise to the user.
