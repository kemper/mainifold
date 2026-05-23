---
session: "fix-wasm-memory-leak"
timestamp: "2026-04-28T22:18:00Z"
model: claude-opus-4-7
sequence: 1
---

## Human

> After I've modeled several things, my laptop has tons of memory used by
> chrome. I've closed many tabs but most of my memory is still used. Is
> there a memory leak? Do we need to fix something in how this app works?

## Assistant

Audited the codebase against the three leak vectors documented in
CLAUDE.md (Three.js disposal, Blob URLs, document/window listeners), plus
WASM-specific concerns (manifold-3d objects, WebGL contexts, IndexedDB
blobs). Three.js disposal, Blob URL revocation, and event-listener
teardown are all handled correctly throughout the codebase.

The real culprit for "memory grows after each model and doesn't free
when tabs close" is in `src/main.ts`, in the run path at the bottom of
`runCurrentCode`:

```ts
currentMeshData = result.mesh;
currentManifold = result.manifold;  // overwrites without delete()
```

`Manifold` is a wasm-managed object. Its memory lives outside the JS
heap, so re-binding the JS reference doesn't reclaim it — `Module.delete`
is the only path. Every successful run leaked the previous Manifold.
Across a long session this matches the user's symptom exactly: Chrome's
GPU/WASM process holds memory that closing the tab doesn't release until
the renderer process tears down completely.

## Human

> Create a new PR based off the staging branch for the easy fixes and
> create a github issue for the one that needs more thought

## Assistant

Fixed the Manifold leak by deleting the previous `currentManifold`
before overwriting. Guarded against re-deleting the same instance and
swallowed a possible `BindingError` if the engine had already released
it. The previous-mesh adjacency graph the audit also flagged isn't
actually a leak — it's plain JS data that GC reclaims when the variable
is reassigned, so no fix needed there.

The offscreen renderer leak in `src/renderer/multiview.ts` is more
subtle (singleton vs. dispose-between-uses, gallery render loops over
every version) and goes to a separate GitHub issue for design
discussion.
