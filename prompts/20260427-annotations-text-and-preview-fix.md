---
session: "annotations-text-preview-fix"
timestamp: "2026-04-27T17:30:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "chrome-devtools"]
---

## Human

Two follow-ups on the annotate tool:

1. Live drag still isn't showing pixels in real-user testing — only the
   first dot at pointer-down appears, no growth during drag.
2. Add a way to type text as an annotation.

## Assistant

### Fix for live drag

Two suspects, both addressed:

- `LineMaterial.resolution` was likely stale or zero at activation time
  (set during `initViewport` before the canvas had been laid out, and not
  always refreshed by ResizeObserver before the user clicked Annotate).
  When resolution is wrong, segments may render off-screen or invisibly
  thin. Fix: `setLiveResolution(canvas.width, canvas.height)` is now
  called from `activate()` so the LineMaterial always has correct
  dimensions when the user starts drawing. `setLiveResolution` also
  clamps to a minimum of (1,1) defensively.
- `frustumCulled = false` on every Line2 (live + committed). The
  bounding sphere computed at construction time (often from a degenerate
  single-point geometry) doesn't grow as we mutate positions, which can
  cause frustum culling to drop the line on subsequent frames.

### Text annotations

- New `TextAnnotation` discriminated-union member in the annotations
  store. Strokes and texts now share `Annotation[]` with a `type` tag
  (`'stroke'` | `'text'`).
- `textMode.ts` mirrors `annotateMode.ts`: `activate`/`deactivate`,
  click-to-place, raycast onto the mesh, anchor offset along surface
  normal. A floating `<input>` appears at the click position; **Enter**
  commits, **Esc/blur-without-text** cancels.
- Rendering: `textToSprite()` builds a `THREE.Sprite` with a
  `CanvasTexture` of the typed text against a translucent dark pill
  background. `sizeAttenuation: false` keeps the label at a roughly
  constant on-screen size from any camera distance. `sprite.center` is
  shifted upward so the surface anchor stays visible below the label.
- Same render pipeline as strokes: `buildStrokesGroup()` (renamed
  internally to `disposeGroupChildren`) emits both Lines and Sprites.
  Live overlay rebuilds on store change. All four offscreen render
  paths pick up text via the same group.
- UI: `Pen` / `Text` sub-mode tabs at the top of the picker panel.
  Width row shows for Pen, Size row for Text. Color and visibility
  controls are shared. Clear/Undo split into "Undo stroke", "Clear
  strokes", "Clear all".
- Mutual exclusion is now three-way: paint, pen, and text each
  deactivate the others when activated.

### Console API additions

```
listTextAnnotations()                            -> [{id, text, color, fontSizePx, anchor}]
addTextAnnotation({anchor, text, color?, fontSizePx?}) -> {id} | {error}
clearTextAnnotations()                           -> {cleared}
clearAnnotationStrokes()                         -> {cleared}
removeAnnotation(id)                             -> {removed, remaining}
setAnnotationFontSize(px) / getAnnotationFontSize()
```

`undoAnnotation()` now pops the most recent annotation of either type
(was: stroke-only). `clearAnnotations()` now clears both kinds (was:
strokes only). `setAnnotationColor` applies to new strokes AND new
text labels.

### Verified manually

- Live preview during pen drag: pink pixel count grew from 7617 (initial
  dot) to 8215 (after first pointermove) and stayed proportional with
  added stroke length.
- Text mode: clicking the canvas placed an input at the click point;
  pressing Enter committed a `TextAnnotation` with the surface anchor
  offset along the hit normal.
- Text label rendered as a screen-facing sprite in both the live
  viewport and `renderView()` output (~2700 pink pixels at front-right
  isometric for one label).
- Three-way mutual exclusion: activating paint deactivates pen + text;
  activating text deactivates pen + paint; activating pen deactivates
  text + paint.
- `npm run build` passes with no TypeScript errors.
