---
session: "version-forking-api"
timestamp: "2026-04-21T16:00:00Z"
model: claude-opus-4-6
tools: [claude-code]
---

## Human

A browser-based AI session regressed mid-iteration: while producing a
v11a/v12a/v13a branch, it lost parts of the parent design. The agent's
post-mortem blamed `getCode()` returning stale content after
`loadVersion(id)` and asked for either a version return shape that
includes code or a one-shot fork helper. User asked for an assessment
plus a proposal.

## Assessment

Traced the flow. The immediate trigger was almost certainly an argument
mismatch: `loadVersion` accepts a 1-based **index**, but `listVersions()`
returns `id` as the first field and the agent's message literally says
"loadVersion(id)". Passing a string id to `getVersionByIndex` returns
null, so `loadVersion` returns null and never calls `setValue` — the
editor buffer (v13) stays put, and `getCode()` returns that buffer.
CodeMirror's `dispatch` is synchronous, so there's no read-after-write
race.

That's the root cause, but the design issues behind it are real:
1. `loadVersion(index)` is ambiguous given `listVersions()[].id` is first.
2. `loadVersion` doesn't return code/geometryData, forcing a separate
   `getCode()` — vulnerable to the Chrome extension's content filter
   that blocks JS-like strings.
3. No atomic fork primitive, so parallel branches (v11a, v11b...)
   require a 4-step chain with silent-failure surface area at each step.

## Decisions

- Return `{error: "..."}` on failure, not throw — matches the
  convention used by `sliceAtZ`, `modifyAndTest`, `getSessionContext`,
  `help()`. Keep `id` out of the error branch so truthy checks on
  `result.id` still work as success tests.
- Public `loadVersion` and `forkVersion` take an object arg with
  exactly one of `{ index: number }` or `{ id: string }`. Initial
  proposal used runtime `typeof` dispatch on a bare `number | string`
  param; switched to object args after the user flagged that dual-type
  params read as a code smell even when `typeof` mechanically separates
  them. Object args are self-documenting (`{index: 2}` vs
  `{id: "..."}`), reject both-set / neither-set at the boundary, and
  keep forkVersion's call site readable. Internal sessionManager
  helpers (`loadVersion`, `peekVersion`) still accept the looser
  `number | string` — the object-arg unwrapping happens at the public
  boundary only.
- `forkVersion` re-uses the existing `runAndSave` pattern (validate in
  isolation, commit atomically, return diff + galleryUrl), adding a
  `parent` field so the agent sees which version was forked even on
  assertion failure.
- `peekVersion` (read-only lookup that doesn't mutate current-version
  state) added to sessionManager so `forkVersion` can read the parent
  without moving the session pointer before save.
- Cross-session id lookups are rejected in `loadVersion`/`peekVersion`
  to avoid an agent accidentally loading a version from a different
  session by id.

## Changes

- `src/storage/db.ts`: Add `getVersionById(id)` for id-based lookup.
- `src/storage/sessionManager.ts`: Rename `loadVersionByIndex` ->
  `loadVersion(target: number | string)`; add `peekVersion` for
  state-free reads.
- `src/main.ts`: `loadVersion` now returns
  `{id, index, label, code, geometryData}` or `{error}`; new
  `forkVersion(target, transformFn, label?, assertions?)` that loads +
  transforms + validates + saves in one call; `help()` entries updated.
- `src/ui/gallery.ts`: Import rename to match new sessionManager API.
- `public/ai.md`: New "Forking a prior version" section; updated
  console API block; two new "Common agent mistakes" bullets
  (index-vs-id gotcha, don't hand-chain load/getCode/save).
- `CLAUDE.md`: Version navigation block documents both new shapes.

## Workflow

Branched off `origin/staging` (at merge commit `8953386` for PR #17),
not off `main`, per project convention that all work goes through
staging first.
