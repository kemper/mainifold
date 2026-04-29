---
session: "paint-phase-2-followup"
timestamp: "2026-04-28T20:30:00Z"
model: claude-opus-4-7
tools: [Read, Edit, Write, Bash, Grep, mcp__playwright]
---

## Human

Feedback on first pass of paint Phase 2:
- Bucket tolerance should go up to 90°
- Brush should be raycasting pixels, not triangle painting
- Slab should be a draggable cuboid in the viewport, with drag-to-paint
- Slab boundaries should be exact (not just nearest triangles)
- Paint mode should lock model rotation

Do quick wins (#1, #2 from a four-item plan); open issues for the harder ones.

## Assistant

### Key decisions

- **Tolerance up to 90°**: replaced the sqrt-curve slider that capped at ~18° with a linear 0..90° → cos(angle) mapping. The `setBucketTolerance` API still accepts a cosine; only the slider semantics changed.
- **Orbit lock**: matched the existing pattern from `selectMode.ts` / `textMode.ts` / `annotateMode.ts`. Paint mode `activate()` records `priorOrbitLock = isUserOrbitLocked()` and calls `setUserOrbitLock(true)`. `deactivate()` restores the prior state (so if the user manually unlocked, we don't re-lock when the next mode activates).
- **Draggable slab cuboid**: new `src/color/slabDrag.ts` module owns its own canvas listeners (separate from paintMode's). When the slab tool is selected, paintMode's `setTool('slab')` activates the drag handler. The cuboid is a translucent `THREE.Mesh` (BoxGeometry) plus a `LineSegments` outline added to `meshGroup`.
  - **Hover state** (no drag): cuboid appears as a thin slab (~1% of model span) at the cursor's hit-point axis coord.
  - **Drag state**: mousedown captures start coord; subsequent mousemove updates end coord; mouseup commits a slab region from `min(start,end)` to `max(start,end)`.
  - **Re-attach on viewport refresh**: viewport's `updateMesh` clears `meshGroup`, so `refreshVisual` checks `cuboid.parent` and re-adds if detached. Same pattern as the existing highlight mesh.
- **Exact slab boundaries** and **pixel-level brush** are too big for this PR. Filed as separate issues for a later session.
