---
session: "fix-unlock-fork"
timestamp: "2026-04-24T16:50:00Z"
model: claude-opus-4-6
tools: [claude-in-chrome, browser-testing]
---

## Human

When I unlock a colored version, no new version is created. Expected v3 (uncolored) to appear after unlocking v2 (colored).

## Assistant

### Key decisions

The issue was that `saveVersion` in sessionManager silently skips saves when the code is identical to the current version. Since the unlock fork creates two versions with the same code (one colored, one clean), both were being skipped.

Fix: added `options?: { force?: boolean }` to `saveVersion` to bypass the duplicate-code check. The unlock handler now:
1. Force-saves the colored version (v2) with colorRegions in geometryData
2. Re-renders without colors
3. Force-saves a clean uncolored version (v3) — this becomes the active version

The user now sees the expected flow: v2 (colored, locked) preserved in gallery, v3 (uncolored, editable) active.
