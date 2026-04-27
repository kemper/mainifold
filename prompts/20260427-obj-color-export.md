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
