---
session: "auto-create-sessions"
timestamp: "2026-04-08T15:45:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Research the session system, then ensure a session always exists when the
editor opens. If the user makes no changes, don't persist the session.

## Assistant

### Key decisions

**Auto-create on every editor entry**: Rather than lazy-creating on first code
change or first run, we always create a session when the editor view loads
without one. This covers all paths: landing page "Open Editor", direct URL
without ?session=, and help page back-navigation.

**Auto-create in runAndSave()**: If an AI agent calls runAndSave() without
first calling createSession(), we now auto-create a session using the label
as the session name. This directly fixes the original problem.

**Cleanup via beforeunload**: Empty sessions (0 versions, 0 notes) are deleted
on page unload so the landing page doesn't fill with unused entries.

**deleteIfEmpty() helper**: Added to sessionManager.ts — checks version count
and note count before deleting. Used by the beforeunload handler.

### Files changed

- `src/main.ts` — auto-create in 3 editor entry paths, runAndSave fallback,
  beforeunload cleanup, preserve session URL params on help back-nav
- `src/storage/sessionManager.ts` — added deleteIfEmpty()
