---
session: "viewport-gizmo-dimensions-measure"
timestamp: "2026-04-24T15:30:00Z"
model: claude-opus-4-6
tools: [claude-code, playwright-mcp]
---

## Human

Add an XYZ orientation gizmo to the interactive viewport, bounding box
dimension annotations, drag-to-measure tool, and camera lock controls.

## Key Changes

1. **XYZ Orientation Gizmo** — Three.js ViewHelper in the upper-right corner
   showing colored X/Y/Z axes with labels. Click any axis to snap the camera
   to that view with smooth animation. Z-up-correct view targets for all 6
   axes. Fixed ViewHelper's autoClear bug that was blanking the main render.

2. **Bounding Box Dimensions** — Extension lines, dimension lines, tick marks,
   and labeled values for X/Y/Z extents. On by default, toggleable via the
   📐 button. Updates automatically when the model changes.

3. **Drag-to-Measure** — Reworked from click-click to press-drag-release.
   Live dashed line + distance label during drag. Click to dismiss. Refactored
   measureOverlay.ts for efficient in-place updates during drag (no
   create/destroy per frame).

4. **Camera Lock Controls** — Measure mode now locks camera rotation while
   active. Added dedicated 🔓/🔒 toggle button for manual orbit lock.
   Central orbit lock system in viewport.ts with multiple independent lock
   sources (measure, user, gizmo animation).

## Files

- `src/renderer/orientationGizmo.ts` (new)
- `src/renderer/dimensionLines.ts` (new)
- `src/renderer/measureOverlay.ts` (reworked)
- `src/renderer/viewport.ts` (modified)
- `src/ui/layout.ts` (modified)
- `src/ui/measureTool.ts` (reworked)
- `src/main.ts` (modified)
