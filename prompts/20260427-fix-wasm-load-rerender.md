---
session: "fix-wasm-load-rerender"
timestamp: "2026-04-27T19:34:00Z"
model: claude-opus-4-7
tools: [chrome-devtools]
---

## Human

When I hard refresh a page I see "Loading WASM" but I don't think it refreshes and re-renders the model when the wasm load is complete. Base your worktree off staging and investigate. If you think you understand this issue and can fix it, make a PR with the fix.

## Assistant

### Key decisions

Root cause was a TDZ error: `let _running = false` in `main.ts` was declared mid-function (after `await syncEditorFromURL()`). On hard refresh, `syncEditorFromURL → loadVersionIntoEditor → runCodeSync` references `_running` before its declaration line executes, throwing "Cannot access '_running' before initialization". The unhandled rejection escaped to `main().catch`, leaving the status bar stuck on "Loading WASM..." and the model never rendered.

Fix: hoisted the `let _running = false;` declaration to the top of `main()` next to other state vars (`engineOk`, `editorReady`, etc.) so async callbacks fired during initial load can safely reference it.
