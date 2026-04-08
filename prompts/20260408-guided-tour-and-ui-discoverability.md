---
session: "guided-tour-ui-discoverability"
timestamp: "2026-04-08T15:40:00Z"
model: claude-opus-4-6
tools: [playwright-mcp]
---

## Human

Make the editor interface more intuitive with first-visit guided tour
arrows pointing to features. Reference image upload isn't obvious. The
editor UI developed organically and could be improved/streamlined.

## Changes

- `src/ui/tour.ts` (new) — Spotlight-based coach mark tour system (7 steps):
  Code Editor, Run, 3D Viewport, Sessions, Reference Images, Gallery, Export.
  Auto-starts on first visit, persists in localStorage, keyboard nav,
  skips AI agent URLs, gracefully skips missing targets.
- `src/style.css` — Tour overlay CSS (spotlight cutout via box-shadow,
  tooltip with directional arrows, transitions)
- `src/ui/sessionBar.ts` — Restyled ref upload as blue accent button,
  added IDs on save/gallery buttons for tour targeting
- `src/ui/layout.ts` — Added Measure toggle button to viewport, renamed
  Clip to Cross Section, added tooltips to all 5 tab buttons
- `src/ui/toolbar.ts` — Replaced Run button with auto-run toggle (ON by
  default, shows manual Run when paused), added tour re-entry button
- `src/ui/help.ts` — Added "Take the guided tour" CTA card
- `src/main.ts` — Tour integration (maybeStartTour after editor init),
  measure toggle wiring, auto-run gate on editor onChange
