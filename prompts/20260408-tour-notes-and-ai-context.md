---
session: "tour-notes-and-ai-context"
timestamp: "2026-04-08T22:58:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Update the guided tour to include the Notes tab and add AI agent context
to each step explaining how AI-driven design impacts that area.

## Changes

- `src/ui/tour.ts` — Added "Design Notes" step (8th step, targeting
  `[data-tab="Notes"]`) explaining how to log requirements, decisions,
  and feedback. Updated 6 existing steps with AI context: Code Editor
  (AI writes code automatically), Live Rendering (API-driven renders),
  3D Viewport (AI uses isometric/elevation views), Sessions (AI creates
  sessions and versions), Gallery (AI generates gallery URLs), Reference
  Images (minor wording tweak).
