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

1. **Split vertices** — manifold-3d `getMesh()` duplicates vertices at property boundaries. In an indexed format like OBJ, shared edges had different vertex indices for the same physical position, making them topologically non-manifold. Fix: deduplicate vertices by position before writing.

2. **Missing face normals** — without `vn` entries, slicers infer inside/outside from winding order alone, which can fail on complex geometry. Fix: compute face normals via cross product (same as STL exporter) and write `f v//vn` format.
