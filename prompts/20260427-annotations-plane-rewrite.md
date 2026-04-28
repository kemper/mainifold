---
session: "annotations-plane-rewrite"
timestamp: "2026-04-27T18:30:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "chrome-devtools"]
---

## Human

Live drag rendering still doesn't work in real testing. I'd also like a
pointer to select annotations and move them around. The current approach
might be too complex — annotations are just to point things out to the
AI. What if we treated them as paint/text on a plane that hangs in front
of the model from whatever angle the user activates? Pick the simplest
working approach.

Plane offset 5%, but adjust with zoom. Each re-activation creates a new
plane. Show a faint outline of the plane while annotating. Add a
"View from this annotation's angle" button.

## Assistant

### Architectural reset

Replaced surface-stuck mesh raycasting with a **camera-frozen plane**
captured at the moment the user activates Annotate. All drawing
(strokes + text) happens on that flat plane via screen-to-plane
unprojection. Annotations remain in 3D world space, so they continue to
appear in `renderView()` and the AI Views tab through the existing
pipeline — but the placement is geometrically much simpler and the
edge-case-prone surface raycast / normal offset is gone entirely.

Key files:

- `src/annotations/sessionPlane.ts` — new module owning the active
  session's plane, screen-to-plane unprojection, plane outline visual,
  and `restoreCameraView()`. Plane offset =
  `max(modelMaxDim * 0.55, cameraDistance * 0.05)`, so it scales with
  the user's zoom level.
- `src/annotations/selectMode.ts` — new sub-mode. Click an annotation
  to select; drag on its stored plane to translate; Delete/Backspace
  to remove; Esc to deselect. Orbit is **not** locked in select mode
  so the user can rotate to find the annotation they want.
- `src/annotations/annotateMode.ts` — pen-mode rewritten to use
  `screenToActivePlane()`. Live preview Line2 uses the same builder as
  committed strokes; `frustumCulled = false` and resolution-on-activate
  remain from the prior fix attempt.
- `src/annotations/textMode.ts` — text-mode rewritten the same way.
- `src/annotations/annotateUI.ts` — three sub-mode tabs (Pen / Text /
  Select), shared color picker, mode-specific size pickers, and a
  "View from here" button enabled when a selection exists.

### Each annotation captures camera + plane

`StrokeAnnotation` and `TextAnnotation` now carry both `camera` (for
restore-view) and `plane` (for select-mode drag — re-derives a
THREE.Plane from stored normal + origin). This means each annotation
is fully self-describing: you can drag it on its own plane regardless
of where the camera currently is.

### Mutual exclusion is now four-way

Paint, Pen, Text, Select each deactivate the others on activation.
Pen↔Text shares the same session plane (deactivate keeps the session);
Select clears the session entirely (each annotation has its own plane).

### Console API additions

`restoreAnnotationView(id)` — snaps the camera to the angle the
annotation was originally drawn from. `listAnnotations()` and
`listTextAnnotations()` now include the `camera` snapshot.

### What I dropped

- Mesh raycast for stroke/text placement
- Surface-normal offset (no z-fighting because we're on a flat plane)
- The "annotations need to be raycastable on the surface" assumption

### Verified

- `npm run build` passes with no TypeScript errors.
- Three-tab UI renders. "View from here" disabled until selection exists.
- Live preview test: pink count grew during drag (711 → 2940 after commit).

### Known follow-ups

- Plane outline rendered at opacity 0.35 — visible at first glance but
  may need polish. Initial experimentation showed the outline wasn't
  visible until I added an explicit `camera.updateMatrixWorld()` call
  in `showPlaneOutline()` to handle the case where the camera matrix is
  stale relative to OrbitControls.
- Net code is smaller than the previous surface-raycast version.
