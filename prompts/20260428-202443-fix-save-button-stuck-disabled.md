---
session: "fix-save-button-stuck-disabled"
timestamp: "2026-04-28T20:24:43Z"
model: claude-opus-4-7
tools: [chrome-devtools-mcp]
---

## Human

I noticed that once a model is locked, painting doesn't reenable the save button
so that I can click on it to save a new version. Please change your git
worktree to be based on staging, then investigate and fix. Once you have a fix,
create a PR.

I also want annotations to reenable the save button. New notes as well.

## Assistant

### Root cause

The Save button in the session bar got *stuck* in the disabled state. Two
problems compounded:

1. The click handler in `src/ui/sessionBar.ts` set `saveBtn.disabled = true`
   and added `opacity-50` on click, but the `finally` block only reset the
   `saving` guard — it never re-enabled the button. As long as `saveVersion`
   notified state change (success path), the bar re-rendered and replaced the
   button. But when `saveVersion` returned `null`…
2. `sessionManager.saveVersion` skips with no notify when
   `currentVersion.code === code`. After painting (code unchanged but
   `geometryData.colorRegions` mutated), clicking Save hit this skip — the bar
   never re-rendered, so the disabled button persisted forever.

Annotations and notes have the same shape (no code mutation) but they're
session-level, so saving a new version doesn't capture them differently. The
user still wanted the button clickable after those edits.

### Fix

- **`src/ui/sessionBar.ts`** — re-enable the button in `finally`. Force-save
  when `colorRegions` differ from the current version (the existing dedup
  ignored them). Subscribe to `onColorRegionsChange`, `onAnnotationStrokesChange`,
  and the new `onNotesChange` so the bar re-renders on those edits — defensive
  and keeps the bar coherent if any other state-bound bit gets added later.
- **`src/storage/sessionManager.ts`** — added `onNotesChange` listener and
  `notifyNotes()` call inside `addSessionNote` / `updateSessionNote` /
  `deleteSessionNote`.
- **`src/ui/notes.ts`** — routed delete/update through the sessionManager
  wrappers so the notify fires (was calling the db layer directly).

### Verification

Reproduced the bug in Chrome DevTools MCP: clicked Save once on an unchanged
session, observed `disabled=true` and `opacity-50` persisting indefinitely.
After the fix, the button briefly disables during the click, then comes back
enabled — both for the silently-skipped save and for the successful save where
the bar re-renders.
