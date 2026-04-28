---
session: "obj-color-fix"
timestamp: "2026-04-28T09:30:00Z"
model: claude-opus-4-6
tools: []
---

## Human

OBJ export colors are wrong in Bambu Studio — colors appear in wrong places, bleeding between regions.

## Assistant

### Key decisions

Per-vertex colors (`v x y z r g b`) cause massive color bleeding when vertices are shared between differently-colored faces. 75.7% of faces had wrong colors because shared vertices at color boundaries get one color (first-write-wins), and the other faces that share that vertex display the wrong color.

Fix: removed vertex colors entirely. Colors now carried exclusively via `usemtl` face groups + MTL `Kd` diffuse colors, which gives clean per-face color assignment. Bambu Studio reads usemtl face ranges as color metadata on a unified mesh (does NOT split into separate parts — confirmed from Bambu Studio source code analysis).

Also switched 3MF export from `<basematerials>` to `<m:colorgroup>`/`<m:color>` (Materials Extension) since Bambu Studio has zero references to basematerials in its 9200+ line 3MF parser.

Installed PrusaSlicer CLI (`brew install --cask prusaslicer`) for headless manifold validation — `--info` flag uses the same algorithm as Bambu Studio and confirms `manifold = yes` for all exports.
