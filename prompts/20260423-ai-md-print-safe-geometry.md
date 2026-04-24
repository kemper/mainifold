---
session: "ai-md-print-safe-geometry"
timestamp: "2026-04-23T14:30:00Z"
model: claude-opus-4-6
---

## Human

Reported a v8 3D print where the top surface disappeared in the slicer. The
driving AI had diagnosed it as sub-extrusion-width geometry caused by an
extrusion with `scaleTop=[0.01, 0.01]` tapering to a near-point: layer area
dropped from 118 mm² at z=5.8 to 0.07 mm² at z=6.55, well under the slicer's
~0.4 mm² effective minimum.

Asked whether the fix belonged in agent instructions or in code, and if
instructions, that the real agent file is `public/ai.md` (not `CLAUDE.md`,
which is for internal use).

## Assistant

### Investigation

Confirmed the other AI's diagnosis is correct and identified the gap:

- `GeometryAssertions` in `src/main.ts:233` checks volume, bounds,
  components, genus, triangles, and ratios -- nothing about minimum
  cross-sectional area or per-layer thickness.
- `analyzeZProfile` in `src/geometry/profileAnalysis.ts` already samples
  area by Z region but doesn't flag sub-extrusion-width layers, and its
  default 20-sample density can skip over a thin cap entirely.
- `runAndExplain` has diagnostics for disconnected components and
  containment but no printability heuristic.
- Neither `CLAUDE.md` nor `public/ai.md` warned about the pattern.

### Key decisions

**Prose-first, code-later**: Recommended mirroring the existing "warn in
prose, enforce in code" pairing the project already has for boolean
overlap. Step 1 is the `ai.md` section; step 2 (if the prose proves
insufficient) is a `printability: { nozzleWidth, layerHeight, minLineWidth }`
assertion in `GeometryAssertions`. Skipping the assertion for now avoids
picking a default threshold prematurely.

**Section placement in `ai.md`**: Added "Print-safe geometry" between
"Common pitfalls for boolean operations" and "Reference images" since
it's a parallel failure-mode warning. Also added a scannable bullet in
"Common agent mistakes" so agents see it near the top, and a TOC entry.

**Snippet uses existing APIs**: The pre-check snippet (`getBoundingBox` +
`sliceAtZ` loop near `zMax`) uses APIs already shipping, so no code
change is required to adopt the guidance.

**Concrete failure numbers**: Kept the user's real v8 numbers
(118 mm² -> 0.07 mm² at z=6.55) in the example since a specific story
sticks better than an abstract rule.

### Branching

Branched from `origin/staging` for the PR per project convention that
all work lands on `staging` before `main`.
