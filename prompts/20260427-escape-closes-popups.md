---
session: "escape-closes-popups"
timestamp: "2026-04-27T21:40:00Z"
model: claude-opus-4-7
tools: [Read, Edit, Bash, Grep]
---

## Human

make sure your worktree is based on the staging branch. Then, I noticed
that when annotation that I noticed that hitting escape key did not hide
the annotation menu (and perhaps other sub menu popups from other things
like painting). Can you make sure that the esc key closes them (and
fires any events that should be fired properly upon then closing)?

## Changes

- `src/annotations/annotateUI.ts`: Added `closeMenu()` and
  `isAnnotateOpen()` exports. `closeMenu()` mirrors the close branch of
  `toggleAnnotateMode()` so the same teardown runs — `onActiveChange`
  callbacks fire (panel hides, button styling resets) and the session
  plane outline tears down via `hidePlaneOutline()` + `endSessionPlane()`.
- `src/color/paintUI.ts`: Added `isPaintOpen()` export. The existing
  `forceDeactivate()` already handles the close-and-fire-events flow.
- `src/main.ts`: Refactored `initMeasureToggle` to expose a reusable
  `closeMeasureIfActive()` closure that deactivates measure, releases
  the orbit lock, and resets the button class. Added
  `initEscapeMenuClose()` — a single document-level keydown handler
  that on Escape:
  - Bails when typing in INPUT/TEXTAREA/contenteditable (e.g. editor,
    text-annotation input, session name field).
  - Defers to select-mode's existing deselect-on-Escape when an
    annotation is selected (one Escape deselects, the next closes).
  - Otherwise closes any open annotate, paint, and measure menus.

## Notes

- Worktree was 21 commits behind `staging`; merged `origin/staging` in
  before making changes.
- Text-mode's input handler calls `e.stopPropagation()` on Escape, so
  the global handler won't fire while a label is being typed — the
  input's own cancel flow runs unchanged.
- Verified `npm run build` succeeds with no TypeScript errors.
