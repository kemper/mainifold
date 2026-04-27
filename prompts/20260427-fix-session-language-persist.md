---
session: "fix-session-language-persist"
timestamp: "2026-04-27T11:00:00Z"
model: claude-opus-4-7
tools: []
---

## Human

I had AI build a SCAD model that rendered fine, but reopening the saved
session threw a JavaScript syntax error — the editor was in JS mode trying
to parse SCAD code. The thumbnail showed the correct render, so the engine
was clearly in SCAD mode at save time. How could the language metadata
have ended up wrong?

## Assistant

### Root cause

`createSession` snapshots `getActiveLanguage()` at creation time and stores
it on the session record. `switchLanguage` updates the engine, editor, and
toolbar but never writes the new language back to the active session row.
So the bug flow is:

1. AI opens `/editor?view=ai` — default `manifold-js`.
2. AI calls `createSession()` — session stored with `language: undefined`
   (treated as `manifold-js`).
3. AI calls `setActiveLanguage('scad')` → `switchLanguage('scad')`. Engine
   switches, but the session row is never updated.
4. AI calls `runAndSave(scadCode, ...)` — runs through SCAD engine, saves
   version with SCAD code, captures correct thumbnail.
5. User reopens — load path reads `session.language ?? 'manifold-js'`,
   gets `'manifold-js'`, parses SCAD as JS → SyntaxError.

### Fix

Added `setSessionLanguage(id, lang)` in `sessionManager.ts` that calls
`updateSession` and refreshes in-memory state. `switchLanguage` in
`main.ts` now invokes it for the active session after the engine is ready.
Sessions now stay in sync with the active engine across language switches.
