---
session: "annotations"
timestamp: "2026-04-27T15:00:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "chrome-devtools"]
---

## Human

Add a way for the user to annotate the model by drawing on it, so the AI can
look at the marks and infer where to make changes. Keep things simple:
annotations should be easy to create, remove, hide, and unhide. The painting
feature shipped first and locks the editor; annotations should not.

## Assistant

### Key decisions

- **Raycasted 3D polylines, not screen-space overlay.** Each pointer sample
  raycasts onto the solid mesh; hits are stored as `THREE.Vector3` in a
  `THREE.Line` inside a dedicated scene `THREE.Group`. Strokes follow the model
  during orbit and appear automatically in every render path (live viewport,
  AI Views, Elevations, `renderView()`).
- **Surface offset along hit normal** (0.5% of model max dim) avoids
  z-fighting without breaking depth occlusion. Lines correctly hide behind the
  model when occluded.
- **Mutual exclusion with paint mode** via reciprocal `forceDeactivate()`
  hooks in `paintUI` and `annotateUI`. Each mode's activate path drops the
  other; both are wired to `setUserOrbitLock(true)` while drawing.
- **No persistence layer** — strokes are in-memory only. Survive within a
  session view but cleared by reload. Matches the "ephemeral comm tool"
  framing and avoids IndexedDB schema changes. If reload-survival is wanted
  later, JSON-shaped strokes can be slipped into session notes or geometryData.
- **Visibility is a separate channel from strokes mutation.** `onChange` and
  `onVisibilityChange` both trigger refresh of the offscreen-rendered panes
  (multiview, elevations) so toggling visibility updates them without
  rebuilding the geometry.

### Architecture

- `src/annotations/annotations.ts` — strokes store with `onChange` listeners.
- `src/annotations/annotationOverlay.ts` — owns the live scene group; provides
  `buildStrokesGroup()` / `disposeStrokesGroup()` for offscreen scenes.
- `src/annotations/annotateMode.ts` — pointer raycast handlers; mirrors
  paintMode's activate/deactivate pattern.
- `src/annotations/annotateUI.ts` — toolbar button, color picker, undo/clear
  actions, count badge.
- `src/renderer/multiview.ts` — all four render paths
  (`renderViewsToContainer`, `renderCompositeCanvas`, `renderSingleView`,
  `renderElevationsToContainer`) now call `buildStrokesGroup()`, attach to
  scene, render, then dispose.

### Console API additions

```
listAnnotations()           -> [{id, color, points, pointCount}]
getAnnotationCount()        -> number
undoAnnotation()            -> {removed, remaining}
clearAnnotations()          -> {cleared}
setAnnotationsVisible(bool) -> {visible}
areAnnotationsVisible()     -> bool
setAnnotationColor([r,g,b]) -> {color} | {error}
```

### Verified manually

- Live viewport renders strokes (~647 pink pixels for one stroke at 2238×1620).
- AI Views tab renders strokes across the visible angles.
- Elevations tab renders strokes (226 pink pixels across 6 view tiles).
- `renderView()` includes strokes at angles where the marked surface is
  visible; correctly omits them where the surface is occluded.
- Mutual exclusion: clicking Paint while Annotate is active deactivates
  Annotate, and vice versa.
- `npm run build` passes with no TypeScript errors.
