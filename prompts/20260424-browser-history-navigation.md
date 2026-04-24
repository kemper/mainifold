---
session: "browser-history-navigation"
timestamp: "2026-04-24T18:11:55Z"
model: gpt-5-codex
tools: [codex, playwright]
---

## Human

The browser back button did not work correctly. Moving from `/` to the editor
overwrote the root history entry, and switching editor sections such as
Interactive to Gallery also overwrote the current entry instead of allowing
Back to restore the previous view. The request was to research as needed,
make the changes, confirm they work, and create a PR.

## Approach

Changed tab navigation to push history entries for user-visible view changes
while still allowing internal URL synchronization to opt out during `popstate`.
Added route synchronization in `main.ts` so browser Back/Forward re-applies the
page and editor tab represented by the URL instead of only changing the address
bar.

Kept automatic session/version URL writes as replacements so session creation,
saving, and version updates do not flood browser history. Also removed a stale
gallery URL helper and stopped session URL updates from deleting tab-owned
parameters.

Verified with Playwright in a real Chromium window because headless Chromium in
this environment could not create a WebGL context. Smoke checks covered:
root to editor then browser Back to root, Interactive to Gallery then browser
Back to Interactive, help route Back behavior, landing-page session tile loading,
AI-view deep linking, and `npm run build`.
