---
session: "annotations-line2-cache-bug"
timestamp: "2026-04-27T20:40:00Z"
model: claude-opus-4-7
tools: ["Read", "Edit", "Write", "Bash", "Agent (Explore + general-purpose research)"]
---

## Human

Live drag still doesn't render. Enlist subagents to investigate, given the
failure history.

## Assistant

### Three subagents launched in parallel

1. Code archaeology (Explore very-thorough) — trace pointermove → render.
2. Three.js Line2 research — web + source dive.
3. Architecture alternatives — propose escape hatches.

### Convergent root cause

Agents 1 and 2 independently identified a **known three.js bug**:

- [three.js#27205](https://github.com/mrdoob/three.js/issues/27205) — "setPositions on LineGeometry doesn't delete `_maxInstanceCount`"
- [three.js#21488](https://github.com/mrdoob/three.js/issues/21488) — "Calling setPositions twice does not update lines correctly"

`LineGeometry.setPositions()` reallocates the position buffers and sets
`instanceCount`, but does NOT clear the private `_maxInstanceCount`
field. `WebGLRenderer` caches that on first draw and uses it as a hard
clamp on subsequent draws. Once the preview Line2 renders its first
frame with `currentPoints` of length 1 (a degenerate `[p, p]` =
1 segment), the cap is baked at 1. Every later `setPositions` with a
longer array is silently clamped — the buffer values change, but only
the first segment is drawn. Pointer-up "fixes" it because
`rebuildLiveOverlay()` disposes and recreates the LineGeometry, and a
fresh `InstancedBufferGeometry` has no cached cap.

This matches every observation:
- The user sees the first dot (degenerate segment) and nothing else.
- `listAnnotations()` shows growing point counts (the buffer IS getting
  the new data — it's the GPU-clamped `instanceCount` that's wrong).
- Pen drag and select-mode drag both regress, since both go through
  `setLine2Points`.
- Synthetic tests sometimes "worked" because they dispatched many
  pointermoves before the first render, so the cap got baked at the
  larger count.

### Fix

One line in `setLine2Points`:

```ts
geo.setPositions(positions);
delete (geo as unknown as { _maxInstanceCount?: number })._maxInstanceCount;
```

The maintainers recommend this exact workaround in the linked issue.
A more robust pattern (pre-allocated max-size buffer + manage
`instanceCount` directly) is documented in the issue thread but
overkill for our usage.

### What architecture-alternatives agent recommended (deferred)

Hybrid HTML-canvas-during-drag + commit-to-Line2-on-release. We're
deferring this because the cache-clear fix targets the actual root
cause directly. If for any reason this fix doesn't resolve the live-
drag rendering, we have a vetted Plan B in hand.

### Verified

- `npm run build` passes.
- The fix is applied at every `setLine2Points` call site (pen preview,
  select drag in-place mutation).
