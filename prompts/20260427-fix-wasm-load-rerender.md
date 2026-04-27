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

Two related bugs in `main.ts → syncEditorFromURL`:

1. When `?session=<id>` references a session that doesn't exist in IndexedDB (or has no saved versions), `openSession` returns null. The original code only handled the success branch and the no-session-id branch, leaving this case to fall through with no `runCode` call and no status update — so "Loading WASM..." stayed forever and the viewport was empty. Fix: when `openSession` returns null, fall through to create a fresh session if needed and run defaults.

2. `let _running = false` was declared mid-function (after `await syncEditorFromURL()`). In dev (non-minified), `syncEditorFromURL → loadVersionIntoEditor → runCodeSync` references `_running` before its declaration line executes, throwing TDZ. Fix: hoisted the declaration to the top of `main()` next to other state vars.
