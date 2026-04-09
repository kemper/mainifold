# mAInifold — AI Agent Feedback: Round 2
These suggestions follow a second castle-building session, after the first round of
feedback was implemented (runAndExplain, pitfalls docs, createSession returning galleryUrl).
The improvements made a dramatic difference — zero debugging cycles vs. many in session 1.
These are the remaining friction points.
---
## 1. The OVR = 0.5 overlap pattern should be a built-in safeguard
Every additive join required manually subtracting an overlap constant and extending
dimensions. This is fragile — one forgotten instance causes a silent disconnect. Two
possible approaches:
**Option A — a lint warning** in runAndExplain / runAndAssert:
> "2 shapes share a face but have no volumetric overlap — likely to disconnect on union."
**Option B — a safe union helper:**
```js
Manifold.unionSafe([a, b, c], { overlapTolerance: 0.5 })
// Automatically nudges touching bounding boxes to ensure volumetric overlap
```
The lint warning would have the highest impact for the least effort — it catches the
#1 source of silent bugs at the moment they occur.
---
## 2. `runAndSave` should return `galleryUrl`
`createSession` now returns `galleryUrl` — great. But `runAndSave` doesn't include it,
so after saving the final version the URL still has to be constructed manually or obtained
via `getGalleryUrl()`, which is blocked by the browser sandbox in some contexts.
Since `runAndSave` is the natural end of each iteration, returning `galleryUrl` there
makes the handoff seamless:
```js
const r = await mainifold.runAndSave(code, "v4 - final");
// r.galleryUrl  ← add this
```
---
## 3. `runAndAssert` should support `minGenus` / `maxGenus` range, not just exact match
The current `genus` assertion only accepts an exact value. For subtraction steps (cutting
a gate, windows, etc.) the genus needs to *increase*, but the exact count depends on how
geometry overlaps. A range is far more useful:
```js
await mainifold.runAndAssert(code, {
  minGenus: 1,   // at least one through-hole was created
  maxGenus: 20,  // but not explosively many
})
```
---
## 4. Cross-section thumbnail in `runIsolated`
`runIsolated` already returns a 4-view isometric thumbnail — very useful. An additional
top-down cross-section slice at mid-height would help verify hollow geometry (keep walls,
tower interiors, gate punch-through) without requiring a separate `sliceAtZ` call:
```js
const r = await mainifold.runIsolated(code);
// r.thumbnail       — existing 4-view isometric PNG (keep this)
// r.sliceThumbnail  — NEW: top-down SVG or PNG at z50
```
---
## 5. `validate(code)` should check geometry, not just syntax
Currently `validate` only confirms the code won't throw a JS error. A `lintGeometry`
function (or an enhanced `validate`) that runs the code in isolation and reports obvious
issues would give faster feedback before committing to `runAndAssert`:
```js
const r = await mainifold.lintGeometry(code);
// r.valid       — false if code errors, empty result, or status ≠ 0
// r.warnings    — ["componentCount is 3 — possible disconnected geometry",
//                  "volume is 0 — subtraction may have consumed entire shape"]
// r.error       — syntax/runtime error string if applicable
```
---
## 6. Show version label in the editor header
The editor currently shows `v4/4` but not the label. When iterating across multiple
versions, losing track of which label corresponds to the current code adds cognitive load.
**Suggested change:** display `v4/4 — keep and spires` in the session breadcrumb.
This is a small UI change with meaningful ergonomic benefit in longer sessions.
---
## Impact vs. Effort Summary
| Suggestion | Impact | Effort |
|---|---|---|
| `runAndSave` returns `galleryUrl` | High — removes last manual step | Trivial |
| `minGenus` / `maxGenus` range in assertions | High — cleaner subtraction tests | Low |
| Version label in editor header | Medium — reduces cognitive load | Low |
| Overlap lint warning in `runAndExplain` | High — catches the #1 bug class earlier | Medium |
| Cross-section thumbnail in `runIsolated` | Medium — useful for hollow shapes | Medium |
| `unionSafe` with overlap tolerance | Medium — ergonomic, not essential | High |
---
## Context
These suggestions come from two iterative castle-building sessions using the AI agent
console API. Session 1 produced the original feedback (runAndExplain, pitfalls docs,
overlap rules). Session 2 validated those improvements worked — and identified the
remaining gaps above.
