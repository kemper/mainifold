---
session: "fix-export-dropdown-zindex"
timestamp: "2026-04-08T18:05:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Fix export menu rendering underneath measure and cross-section buttons.

## Changes

- `src/ui/toolbar.ts`: Changed export dropdown z-index from `z-10` to `z-20` so it renders above the viewport overlay buttons (measure/cross-section) which also use `z-10`.
