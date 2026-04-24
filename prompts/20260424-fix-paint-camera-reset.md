---
session: "color-regions-ph1-fix"
timestamp: "2026-04-24T16:27:00Z"
model: claude-opus-4-6
tools: [claude-in-chrome, browser-testing]
---

## Human

Whenever I paint a surface the orientation flips back to some default initial position. Is it possible to prevent that?

## Assistant

### Key decisions

Added `skipAutoFrame` option to `updateMesh()` in `viewport.ts`. All color-only update paths (paint, clear, unlock, rehydrate, console API) now pass `{ skipAutoFrame: true }` so the camera stays in its current orbit position. The auto-frame still runs on actual geometry changes (code execution).
