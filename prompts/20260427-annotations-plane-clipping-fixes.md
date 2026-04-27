---
session: "annotations-plane-clipping-fixes"
timestamp: "2026-04-27T19:20:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash"]
---

## Human

The annotation and text clipped into the model. The semi-transparent
indicator showed the plane was inside the model. After clear+zoom out,
the plane indicator went away and didn't come back. Make the plane
slightly foggy/semi-transparent so it's clear we're drawing onto something.

## Assistant

### Plane no longer clips into the model

Was using `modelMaxDim * 0.55` as the offset. For a 10×10×10 cube
viewed along a diagonal, the corner sticks out √3 × 5 ≈ 8.66 from the
center — well past 5.5. Switched to bounding-sphere radius:

```
offset = sphere.radius * 1.05 + cameraDistance * 0.05
```

The first term clears the worst-case corner from any angle; the
second adds a zoom-aware margin so the plane keeps a comfortable gap
as the user pulls back.

### Foggy fill surface

Added a `THREE.Mesh` with `MeshBasicMaterial` at opacity 0.06 behind
the outline rectangle. `depthWrite: false` so the fill doesn't
occlude the model in subtle ways; `DoubleSide` so it's visible from
either direction. Result: a barely-there pale-blue veil that signals
"you're drawing on this surface."

### Plane indicator that wouldn't come back

Reproduced the bug from the user's description by tracing the toggle
path. `toggleAnnotateMode` was calling plain `deactivate()` on each
sub-mode. None of those tear down the session plane — only
`forceDeactivate()` does. So after the toolbar Annotate-button
toggled OFF, `getActiveSession()` was still non-null. The next
re-activation hit `if (!anySiblingActive()) startSession()` — which
saw the stale session and skipped the new `startSession()`. The
outline got rebuilt at the *previous* camera angle, not the new one
after the user zoomed.

Fix: when `toggleAnnotateMode` turns Annotate fully off, also call
`hidePlaneOutline()` and `endSession()` so the next activation
re-captures the camera.

### Verified

- `npm run build` passes.
- New offset formula puts plane clearly outside the bounding sphere
  for both close and zoomed-out cameras.
