---
session: "fix-glb-export-colors"
timestamp: "2026-04-28T18:08:38Z"
model: claude-opus-4-7
---

## Human

Asked to investigate why GLB export doesn't render the colors applied to a
model when opening the GLB in external viewers.

## Assistant

**Root cause:** The viewport scene (`src/renderer/viewport.ts`) adds two
meshes per model that share the same geometry: a colored solid mesh
(`MeshPhongMaterial`, `vertexColors: true`) and a wireframe overlay
(`MeshBasicMaterial`, `wireframe: true, color: 0x000000, transparent: true,
opacity: 0.15`). When `exportGLB` exported the entire scene, three.js's
`GLTFExporter` silently dropped the `wireframe` flag (glTF has no wireframe
rendering primitive), so the overlay was written as a translucent black
triangle mesh on top of the colored mesh. External viewers either dimmed the
colors via blend, hid them entirely (viewers that ignore alphaMode=BLEND), or
z-fought the coplanar tris.

**Fix:** In `src/export/gltf.ts`, traverse the scene before export and hide
all viewport-only objects, restoring visibility in a `finally` block:

- Wireframe meshes (any mesh whose material has `wireframe: true`)
- Named helpers: `phantom-reference`, `dimension-lines`, `measure-overlay`,
  `clip-cap`, `clip-plane-helper`
- `THREE.GridHelper`, `THREE.Line`, `THREE.LineSegments`, `THREE.Sprite`

The pre-existing phantom-hiding logic was folded into the same pass.
