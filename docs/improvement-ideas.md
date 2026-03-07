# Improvement Ideas

## Concurrent AI Session Safety

### Problem: Headless sessions don't persist to the user's browser

When an AI agent uses Puppeteer or similar automation to create sessions, those sessions live in the headless browser's temporary IndexedDB — completely separate from the user's regular browser. The session data is lost when the headless browser closes.

**Solution: File-based session bridge**

- The automation script exports the finished session as a `.mainifold.json` file to a known location (e.g., `sessions/` directory).
- The app can scan for and auto-import session files on load, or the user imports them via the existing Sessions UI.
- This also enables sharing sessions via git, email, or any file transfer.

### Problem: Multiple AIs sharing a browser context step on each other

If two AI agents control the same browser tab (e.g., via DevTools MCP), they share global state:

- **One editor** — `setCode()`/`run()` from one AI overwrites the other's work mid-operation.
- **One `currentManifold`** — geometry stats reflect whoever ran last.
- **One `currentVersion`** — the save-dedup check (`saveVersion` skips if code matches current version) compares against the wrong AI's last save, causing missed saves or false dedup.

**Solution: Isolated execution API**

Add `mainifold.runIsolated(code)` that:
- Executes code in the sandbox and returns geometry data + thumbnail.
- Does NOT mutate global state (editor content, viewport, `currentManifold`, `currentMeshData`).
- Returns `{ mesh, geometryData, thumbnail }` for the caller to use.

Then update `runAndSave(code, label, sessionId?)` to:
- Use `runIsolated` internally.
- Accept an optional `sessionId` so an AI can target a specific session.
- Save the version with the isolated result, not from global state.
- Be a single atomic operation with no visible side effects.

### Problem: No session ownership or locking

Two AIs could accidentally write to the same session if they share a session ID (e.g., from URL state). There's also a race condition in `saveVersion`: it reads the max version index, increments, then writes — this isn't atomic across concurrent callers.

**Solution: Session metadata and atomic versioning**

- Add an `owner` or `agent` field to sessions so each AI's work is clearly attributed.
- Use a single IndexedDB transaction for the read-increment-write in `saveVersion` to make the version index counter atomic.
- Consider session locking: `openSession` could set a `lockedBy` field, and other callers would create their own session instead of writing to a locked one.

## Other Ideas

### Auto-import sessions from filesystem

Watch a `sessions/` directory for `.mainifold.json` files. When the app loads (or on a polling interval), import any new files as sessions. This enables workflows where an AI agent writes output to disk and the user sees it appear in the gallery without manual import.

### Session diffing

Show a visual diff between two versions in a session — overlay the geometry from version N and version N+1 with different colors, or show a side-by-side comparison with delta stats (volume change, added/removed geometry).

### Batch session creation API

A single API call that accepts an array of `{ code, label }` entries and creates a complete session in one operation, rather than requiring sequential `run` + `saveVersion` calls. Reduces round-trips for automation scripts.

```javascript
await mainifold.createSessionWithVersions('Log Cabin', [
  { code: v1Code, label: 'v1 - silhouette' },
  { code: v2Code, label: 'v2 - log walls' },
  { code: v3Code, label: 'v3 - windows' },
]);
```

### Gallery improvements

- Thumbnail hover to show full-size preview.
- Side-by-side comparison mode (pick 2 versions).
- Version annotations/notes beyond just the label.
- Star/favorite versions to mark the best iteration.
