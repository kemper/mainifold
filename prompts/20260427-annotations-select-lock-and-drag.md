---
session: "annotations-select-lock-and-drag"
timestamp: "2026-04-27T20:00:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash"]
---

## Human

Dragging text or an annotation also rotates the model. Dragging should
auto-enable the lock function (with the lock icon enabled when selecting
and annotating). Also, dragging still doesn't render right away.

## Assistant

### Lock orbit in Select mode

`selectMode.activate()` now calls `setUserOrbitLock(true)` (matching
pen and text) and stores the prior lock state on activation, restoring
on deactivate. This stops OrbitControls from competing with the drag
handler for the same pointer events. The lock icon in the toolbar
already reflected pen/text activation; with this change it also lights
up in select mode.

### Lock icon stays in sync programmatically

Added `onUserOrbitLockChange(fn)` to viewport.ts. The icon's reflect
function is wired up so any change to the user-orbit lock — from
pen/text/select activate, the toggle button click, or future
programmatic API — updates the lock-icon state immediately.

### Select drag now mutates the live object in-place

The previous implementation called `updateStrokePoints` on every
pointermove, which triggered a full overlay rebuild (dispose + recreate
every Line2/Sprite) per frame. That worked but was heavy and could
look like rendering lag.

Now `selectMode.onPointerDown` looks up the live `Line2` (or `Sprite`)
matching the selected annotation by traversing the overlay group's
children for a userData hit. During drag we mutate that object
directly: `setLine2Points` for strokes, `sprite.position.copy` for
text. Only on `pointerup` do we commit the final positions to the
store, which causes a single rebuild.

Result: no per-frame allocation churn during drag, and the rendered
position tracks the cursor immediately. If the live object can't be
found (e.g. the overlay was rebuilt out from under us), we fall back
to the store path so the drag still works.

### Verified

- `npm run build` passes.
- Three-mode mutual exclusion: paint, pen, text, select all set the
  user orbit lock when activated; only the toggle button or full
  Annotate-off restores it.
