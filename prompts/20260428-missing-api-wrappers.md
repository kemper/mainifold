# Add missing window.partwright API wrappers

Date: 2026-04-28

## Goal

Five interactive UI features (grid toggle, bounding box dimensions, camera orbit lock, theme toggle, auto-run) had working internal functions but no corresponding `window.partwright` API methods for AI agents. This prevents programmatic control of these features.

## Changes

### src/ui/toolbar.ts
- Added `setAutoRun(enabled)` export that programmatically sets auto-run state and syncs the toolbar button UI
- Added module-level `_syncAutoRunUI` reference so `setAutoRun` can update the button created inside `createToolbar`

### src/main.ts
- Added 10 new methods to the `partwrightAPI` object:
  - `setGridVisible(on?)` / `isGridVisible()` — grid plane visibility
  - `setDimensionsVisible(on?)` / `areDimensionsVisible()` — bounding box dimension overlay
  - `setOrbitLock(on?)` / `isOrbitLocked()` — camera orbit lock
  - `setTheme('dark'|'light')` / `getTheme()` — color theme
  - `setAutoRun(enabled)` / `isAutoRunEnabled()` — auto-render on edit
- Added all 10 methods to the `help()` output under "Viewport controls"
- All setter methods include input validation via existing `assertBoolean`/`assertEnum` helpers
- Toggle-style methods (`setGridVisible`, `setDimensionsVisible`, `setOrbitLock`) accept optional boolean — omit to toggle

### public/ai.md
- Added "Viewport controls" section to the console API reference listing all 10 new methods

## Verification

Tested all 5 features via Playwright browser automation:
- Each get/set pair correctly reads and writes state
- Toggle behavior works when argument is omitted
- Validation throws on bad input (`setTheme('invalid')`, `setAutoRun('yes')`)
- Build passes with no TypeScript errors
