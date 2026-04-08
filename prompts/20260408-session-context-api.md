---
session: "session-context-api"
timestamp: "2026-04-08T16:00:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Add session context API and AI agent notes tracking so agents can resume
sessions with full context and track their thinking/decisions/measurements.

## Changes

- `src/storage/sessionManager.ts`: Added `getSessionContext()` (returns
  session info, version history with geometry summaries, all notes in one
  call), `deleteSessionNote()`, `updateSessionNote()`, and `SessionContext`
  interface.
- `src/main.ts`: Wired three new methods into `window.mainifold` console
  API, updated help text to include Notes category.
- `public/ai.md`: Added notes API to console reference, "Session notes"
  section with prefix conventions (`[REQUIREMENT]`, `[DECISION]`,
  `[FEEDBACK]`, `[MEASUREMENT]`, `[ATTEMPT]`, `[TODO]`), and "Resuming a
  session" instructions.
- `CLAUDE.md`: Enhanced "Design context logging" with prefix conventions,
  added "Resuming a session" section, documented new API methods.

## Key Decisions

- Notes remain plain text (no schema migration) — prefix conventions
  documented in ai.md and CLAUDE.md instead of adding a `type` field.
- `getSessionContext()` excludes version code (use `loadVersion()` if
  needed) to keep the response focused on context.
- `geometrySummary` extracts only key stats (volume, surfaceArea,
  boundingBox dimensions, componentCount, genus, isManifold) from each
  version's full geometryData.
