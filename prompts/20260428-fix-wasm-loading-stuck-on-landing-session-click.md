---
session: "fix-wasm-loading-stuck-on-landing-session-click"
timestamp: "2026-04-28T08:50:00Z"
model: claude-opus-4-7
tools: [chrome-devtools]
---

## Human

make sure working branch based off staging. I recently had an AI session make it so that a hard refresh would respond to wasm load complete and rerender model. I don't see that anymore. I also see "Loading WASM..." when opening a model from the session list and opening the editor the first time. I'm not sure if this is a new set of bugs or some regression where the previous work was lost/changed in some way. investigate, fix, and create a PR

## Assistant

### Key decisions

The earlier fixes from PR #44 (commits 8f57fdc + eb9560f) are still on staging and the hard-refresh case works (verified with Chrome DevTools and slow-3G + 4× CPU throttling: status moves "Loading WASM..." → "Running..." → "Ready" with the model rendered).

There was, however, a sibling bug that PR #44 missed. `syncEditorFromURL` was patched to fall through to defaults when `openSession` returns null, but the analogous landing-page click handler `openSessionFromLanding` was not:

```ts
async function openSessionFromLanding(sid: string) {
  ...
  const version = await openSession(sid);
  if (version) {
    await loadVersionIntoEditor(version);
  }
  // ← no else: status stays at "Loading WASM..." forever
}
```

Repro: from the landing page, click any session tile that has 0 saved versions (or whose ID was deleted). `openSession` returns `null`, `loadVersionIntoEditor` is skipped, `runCode` never fires, and the status that was set to "Loading WASM..." just before `initEngine()` (line 1214) — and which becomes visible the moment `transitionToEditor()` runs — never advances. The viewport stays empty.

Fix: mirror the `syncEditorFromURL` behavior — if `openSession` returns null, set status to Ready and run the default code so the viewport always renders.

### Verification

- Landing → click 0-version session: status now goes to "Ready" with default geometry rendered.
- `npm run build` succeeds.
- Other scenarios (hard refresh of `/editor?session=<id>`, `/editor`, landing → click session-with-versions) still work as before.
