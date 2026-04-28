---
session: "clickable-logo"
timestamp: "2026-04-27T19:15:00Z"
model: claude-opus-4-7
tools: [Read, Edit, Bash, Grep, chrome-devtools]
---

## Human

If anyone ever clicks on the partwright icon and logo, it send them back to
the main landing page of the app. set your working tree to be based off
staging and implement that feature across all pages as applicable. Create a
PR after you've implemented and tested.

## Changes

- `src/ui/toolbar.ts`: The toolbar logo (icon + "Partwright" wordmark) is
  now a `<button>` instead of an inert `<div>`. Added `onGoHome` to
  `ToolbarCallbacks` and wired the click handler. Added `aria-label`,
  `title`, and a hover-opacity transition for affordance.
- `src/main.ts`: `createToolbar` now passes `onGoHome` that pushes `/`
  onto history and calls `syncRouteFromURL()` so the landing page is
  shown without a full page reload.

## Notes

- The landing page already shows the logo within the hero, so no change
  was needed there — clicking from landing would be a no-op.
- The help page and 404 page do not display the logo, so nothing to wire
  up there.
- Verified via Chrome DevTools MCP: navigated to `/editor`, clicked the
  logo, URL transitioned to `/` with the landing page visible. Browser
  back navigation correctly returns to the editor with the prior session
  still loaded. No console errors.
