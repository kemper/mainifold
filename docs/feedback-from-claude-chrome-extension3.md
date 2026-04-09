# mAInifold — Developer Feedback: isManifold & ai.md Gaps
Feedback from an AI agent after three iterative castle-building sessions.
Intended for the developer working on the mAInifold codebase.
---
## Priority 1: Fix `isManifold` in geometry-data
### The problem
`isManifold` always returns `false` in the geometry-data output, even for
primitives like `Manifold.cube([10,10,5])`. This makes it useless as an
assertion and forces agents to use `componentCount === 1` as a proxy — which
is not the same thing.
### Why it matters
A single-component mesh can still be non-manifold (e.g. a degenerate edge
produced by a bad boolean). `isManifold` would catch that; `componentCount`
won't. Right now that class of error is invisible.
### Likely cause
During investigation I found that the WASM Manifold object gets deleted
immediately after code execution:
```
BindingError: Cannot pass deleted object as a pointer of type Manifold
```
This means the geometry-data layer needs to call `.status()` (which returns
0 for a valid manifold) **before** the object is freed — i.e., within the
same execution scope as the geometry construction, not after the sandbox
returns. The fix is likely moving the `.status()` call to happen inside the
runner before cleanup, then surfacing that value in the geometry-data JSON.
### Suggested fix
Within the code runner, before freeing the returned Manifold object:
```js
const statusCode = result.status(); // 0 = valid manifold
geometryData.isManifold = (statusCode === 0);
```
### Do not document around this
The current `ai.md` still lists `isManifold: true` as a valid assertion
parameter and the recommended iteration pattern suggests using it. Once fixed,
this will just work correctly. Do not add a caveat — fix the source.
---
## Priority 2: Document `runAndSave` gallery URL in ai.md
### The problem
`runAndSave` now returns `galleryUrl` in its response object (confirmed
working), but this is not documented in `ai.md`. The only documented way to
get the gallery URL is `mainifold.getGalleryUrl()`, which gets blocked by the
browser security sandbox in some agent execution contexts.
### The fix
Add `galleryUrl` to the `runAndSave` example comment in `ai.md`:
```js
const r = await mainifold.runAndSave(code, "v2 - added towers");
// r.geometry   = full geometry stats
// r.version    = { label, index, id }
// r.diff       = { volume: { from, to, delta }, componentCount: ..., ... }
// r.galleryUrl = "http://localhost:5173/mainifold/?session=abc&gallery"
```
This is a one-line documentation change. No code change needed.
---
## Already working well — no action needed
For completeness, here is what is working correctly after three sessions:
- `runAndExplain` — component centroids and volumes are accurate and useful
- `minGenus` / `maxGenus` range assertions — correct and valuable for
  subtraction steps where exact genus is unpredictable
- `createSession` returning `galleryUrl` — works correctly
- Version label in editor header — good UX improvement
- Common pitfalls section in `ai.md` — the overlap rule, hollow spire, and
  flag pole sections are accurate and sufficient to prevent the main
  disconnect bugs without any debugging cycles
---
## Lower priority — not blocking, but worth tracking
These were requested in earlier feedback rounds but remain unimplemented.
They have low practical impact now that the core workflow is solid.
- **`runAndExplain` gap-detection hint** — the docs show a hint for
  near-touching components (`"gap: 0.00"`) but it isn't being generated in
  practice. Low priority since the overlap pitfall is now well-documented.
- **Cross-section thumbnail in `runIsolated`** — would help verify hollow
  geometry visually. Not needed in practice since volume/genus stats are
  sufficient.
- **`lintGeometry` / enhanced `validate`** — fast pre-flight check before
  `runAndAssert`. Not needed in practice; `runAndAssert` is fast enough.
