---
session: "export-menu-labels"
timestamp: "2026-04-28T10:45:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Fix export menu labels — remove "recommended" badge from OBJ, correct 3MF description that incorrectly says colors are not preserved, and move 3MF to first position.

## Assistant

### Key decisions

Updated the export dropdown in toolbar.ts. 3MF is now first (native Bambu Studio format with per-face colors via m:colorgroup). Removed "recommended" badge from OBJ. Corrected 3MF description from "color regions are not preserved on Bambu import" to "Geometry + color. Native format for Bambu Studio multi-color prints." Added ZIP extraction hint to OBJ description. Updated GLB description for clarity.
