---
session: "obj-color-export"
timestamp: "2026-04-27T18:00:00Z"
model: claude-opus-4-6
tools: []
---

## Human

OBJ and 3MF exports don't preserve color information in Bambu Studio. OBJ files should include colors — seen it work from Blender exports before.

## Assistant

### Key decisions

OBJ export had zero color support — no triColors handling and main.ts wasn't even passing color data (unlike 3MF which already did `applyTriColors`).

Fix: When color regions exist, OBJ export now generates a companion MTL material file with `Kd` diffuse colors for each unique face color, groups faces by `usemtl` material assignment, and bundles OBJ + MTL in a ZIP download. This is the standard OBJ material mechanism that Blender and Bambu Studio read.

Also extracted the ZIP builder from threemf.ts into a shared `src/export/zip.ts` module to avoid duplication.

### Follow-up: non-manifold edges in Bambu Studio

OBJ files caused "3 non-manifold edges" warnings and slicing failures ("empty layer between 2 and 5.2"). Two root causes:

1. **Split vertices** — manifold-3d `getMesh()` duplicates vertices at property boundaries. String-based dedup missed merges where positions differed by tiny floating-point amounts. Fix: use manifold-3d's authoritative `mergeFromVert`/`mergeToVert` vectors via union-find, with quantized position dedup (1e-5) as fallback. Also pass merge vectors through MeshData from both manifold-js and OpenSCAD engines.

2. **Degenerate triangles** — after vertex merging, some triangles collapse (two+ vertices map to same index). These create non-manifold edges. Fix: filter degenerate triangles before writing.

3. **Per-face normals destroyed vertex sharing** — writing `vn` per triangle and referencing them in `f v//vn` format caused OBJ parsers to treat each (vertex, normal) pair as unique. With per-face normals, every vertex became unique per face (352 verts → 2112), making ALL edges boundary/non-manifold. Fix: don't write normals at all — slicers compute them from winding order.

4. **Float precision** — vertex coordinates written with 15+ decimal places (JavaScript float64 string representation of float32 values). Fix: round to 6 decimal places matching float32 precision and Blender convention.

5. **usemtl groups split into separate shells** — Bambu Studio treats each OBJ `usemtl` material group as a separate part/shell that must be independently manifold. Since painted color regions are surface patches (not closed solids), every group had boundary edges at color boundaries. Fix: write all faces as one solid object without usemtl grouping. Note: even the user's reference Blender-exported colored_cube.obj has the same per-group boundary edge issue — this is a fundamental limitation of OBJ materials in slicers. For per-face colors in slicers, 3MF is the proper format.
