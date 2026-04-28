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

## Follow-up — extend to cross-section

User asked for Escape to also close the cross-section view. Added a
`getClipState().enabled` check to the global handler that calls
`setClipping(false)` + `syncClipUI()` so the toggle button reverts and
the slider group hides — same teardown that the toolbar click does.
Verified in Chrome.

## Follow-up — TDZ fix

After the user reported Escape didn't close the popups (and that paint
didn't re-render until the code was edited), browser console showed
`Cannot access 'closeMeasureIfActive' before initialization`. The `let`
binding was declared lower in the same enclosing function than the
`initMeasureToggle` call site, so assigning to it from inside that
function hit the temporal dead zone. The thrown ReferenceError aborted
the rest of the init flow, which is why `setOnRegionPainted(...)` —
the callback that re-renders on paint — never ran. Moved the `let`
declaration above the `initMeasureToggle()` call. Verified in Chrome:
escape now closes annotate, paint, and measure menus.
