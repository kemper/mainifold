# mAInifold — AI Agent Feedback & Improvement Ideas
## What Worked Well
The core iteration API is excellent. `runAndAssert`, `runIsolated`, `runAndSave`, and the
diff output from `runAndSave` provide a tight feedback loop. Being able to test geometry
without committing to the viewport was essential. The assertion schema (volume bounds,
`componentCount`, `genus`) maps naturally onto the kinds of bugs that actually occur in
boolean CSG work.
---
## Issues Encountered
### 1. `isManifold` Always Returns `false`
Even `Manifold.cube([10,10,5])` reported `isManifold: false`. Significant time was spent
diagnosing whether geometry was broken before realising it was a reporting issue. Since
`isManifold: true` is a natural assertion to include, its unreliability causes confusion.
**Suggested fix:** Either repair the field (use `.status() === 0` from the WASM object as
the source of truth), remove it from the schema, or add a note in `ai.md` acknowledging
it is currently unreliable.
---
### 2. No Way to Identify *Which* Component Is Disconnected
When `componentCount > 1`, there is no tool to identify *which* sub-geometry is floating.
The only option is binary-searching by commenting out parts of the union — typically
requiring 5–10 extra `runIsolated` calls.
**Suggested fix:** Add a `mainifold.decomposeComponents()` function that returns the
bounding box and centroid of each disconnected component, so the problem can be pinpointed
immediately.
---
### 3. Silent Failure on "Touching but Not Overlapping" Unions
Shapes placed exactly flush (e.g. a merlon at exactly `z = wallTop`, or a spire base
inside a hollow wall) produce `componentCount > 1` with no error or warning. The manifold
library silently declines to union geometry that shares only a face rather than a volume.
This is the single most common source of hard-to-diagnose bugs.
**Suggested fix:** Document this prominently in `ai.md`. Optionally, surface a
`"unionWarnings"` field in geometry data when the library detects near-touching geometry
that may have failed to connect.
---
### 4. No Operation-Level Error Detail on Boolean Failures
When a boolean operation fails, geometry data only shows unexpected component counts.
There is no stack trace or operation-level failure message to indicate *which* union or
subtraction went wrong.
**Suggested fix:** Expose a `"lastOperationStatus"` or `"operationLog"` field in geometry
data that records warnings from the WASM boolean operations.
---
### 5. `getGalleryUrl()` Blocked by Browser Security Sandbox
The return value of `getGalleryUrl()` was blocked as "cookie/query string data" by the
sandbox. The URL had to be reconstructed manually from the known session ID.
**Suggested fix:** Return the gallery URL directly in the response objects from
`createSession()` and `runAndSave()`, so it is always available without a separate call
that may be sandboxed.
---
### 6. `ai.md` Missing the Overlap Requirement
The most impactful undocumented behaviour: *if two shapes share only a face and do not
volumetrically overlap, `Manifold.union()` may silently leave them as separate components.*
This is fundamental to CSG modelling and deserves a dedicated section in `ai.md`.
---
## Suggested `ai.md` Additions
### New Section: "Common Pitfalls for Boolean Operations"
```
## Common Pitfalls
### Always use volumetric overlap, never flush placement
Shapes that merely touch at a face may not union correctly. Offset joining geometry
by at least 0.5 units along the joining axis to guarantee a clean boolean.
  // BAD — merlon sits exactly on wall top, may disconnect
  merlon.translate([x, y, wallTopZ])
  // GOOD — merlon overlaps 0.5 units into wall body
  merlon.translate([x, y, wallTopZ - 0.5])
### Spires on hollow shapes need a base wider than the inner void
A cone placed on top of a hollow cylinder/box will float inside the void unless its
base radius exceeds the inner hollow radius, ensuring it intersects the wall material.
  // Keep outer half-width = 10, inner hollow half-width = 8
  // Spire base radius must be > 8 to touch wall ring
  Manifold.cylinder(spireH, 11, 0, 24).translate([0, 0, keepH - 0.5])
### Flag poles on cone tips need to start inside the cone body
A cylinder placed at the exact tip of a cone (where radius = 0) has nothing to union
with. Start the pole 1–2 units below the tip so it overlaps solid cone geometry.
### isManifold in geometry-data is currently unreliable
Use componentCount === 1 and appropriate genus values as validity proxies instead.
```
---
## Feature Request: `runAndExplain(code)`
A dedicated debugging function that, when `componentCount > 1`, automatically decomposes
the result and returns for each disconnected component:
- Bounding box
- Centroid
- Approximate volume
- Index in the original `Manifold.union([...])` call (if traceable)
This single addition would cut boolean debugging time by more than half, replacing the
current manual binary-search process with an immediate, targeted diagnosis.
**Example API:**
```js
const r = await mainifold.runAndExplain(code);
// r.componentCount = 3
// r.components = [
//   { index: 0, volume: 14800, centroid: [0, 0, 9], boundingBox: {...} },
//   { index: 1, volume: 12,    centroid: [29, 29, 26], boundingBox: {...} },
//   { index: 2, volume: 8,     centroid: [0, 0, 35],  boundingBox: {...} },
// ]
// r.hint: "2 small disconnected components detected — likely floating attachments"
```
