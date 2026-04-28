---
session: "grid-plane-toggle"
timestamp: "2026-04-24T19:00:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

Add a toggleable grid plane to the viewport, hidden by default, positioned
below the model at its bounding box minimum Z.

## Key Changes

- `src/renderer/viewport.ts`: Store grid reference at module level, default
  to hidden, position at `box.min.z` on each mesh update, export
  `setGridVisible`/`isGridVisible` API
- `src/ui/layout.ts`: Add grid toggle button (▦) in viewport overlay controls
- `src/main.ts`: Wire up grid toggle button with active/inactive styling
