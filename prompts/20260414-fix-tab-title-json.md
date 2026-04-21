---
session: "fix-tab-title-json"
timestamp: "2026-04-14T23:40:00Z"
model: claude-opus-4-6
tools: [claude-in-chrome]
---

## Human

Fix the Chrome tab title changing to JSON (showing `"passed": true`) during AI agent sessions.

## Changes

- `src/main.ts`: Add active document.title management that reflects app state (landing, editor with session name, help, 404). Install a MutationObserver guard on the `<title>` element that auto-restores the correct title if browser automation tools inadvertently overwrite it with JS evaluation results.
