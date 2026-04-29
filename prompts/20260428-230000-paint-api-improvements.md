---
session: "paint-api-improvements"
timestamp: "2026-04-28T23:00:00Z"
model: claude-opus-4-7
---

## Human

After spending too long fighting `paintRegion`'s flood-fill behavior on smooth
geometry, I want generic, lasting improvements for AI agents that model and
paint with this app.

## Assistant

Audited the paint surface and shipped a coherent set of additions in
`src/main.ts` plus matching docs in `public/ai.md`:

**New APIs**
- `paintNear({ point, radius, normalCone?, color, name? })` — sphere selector,
  no flood-fill tolerance to tune.
- `paintInBox({ box, normalCone?, color, name? })` — AABB selector with
  optional normal-cone restriction.
- `paintPreview({ box?|point+radius?|triangleIds?, normalCone?, view? })` —
  dry-run that returns a thumbnail with the candidate region tinted bright
  yellow. Does not commit.
- `assertPaint({ region, expectedTriangleCount?, expectedBoundingBox?,
  expectedCentroid? })` — verify a previously-painted region; pairs with
  `runAndAssert`.
- `getMesh()` — direct triangle/vertex/normal/centroid access (typed arrays)
  for procedural paint workflows.

**Improvements**
- `paintRegion`'s "no matching face found" error now includes the nearest
  triangle's position, normal, distance, angle off the requested normal, and
  a suggested tolerance value that would accept it. Same data is also
  exposed structured under `r.nearest`.
- `listRegions()` now includes `bbox` and `centroid` per region, so callers
  can verify *where* a region landed without re-rendering.

**Docs**
- New "Common gotchas" section in `ai.md` documenting:
  - `paintRegion` flood-fill bimodality on smooth surfaces (use `paintNear` /
    `paintInBox` instead).
  - "Trust `probeRay`'s hit normal — don't derive your own."
  - Manifold's `rotate` direction with a 3-line verification snippet.
  - "Painting locks the editor; `clearColors()` to iterate."
  - "Verify before you commit" — `paintPreview` + `assertPaint`.
  - `runIsolated` vs `runAndSave` for sanity checks.
- Console API summary updated with all new method signatures.
- `partwright.help()` entries updated.

**Verification**
- 10-step Playwright smoke test driving the new APIs against a localhost
  dev build: `runAndSave`, `getMesh`, `paintRegion` success + diagnostic
  failure, `paintInBox` (with and without normal cone), `paintNear`,
  `listRegions` (bbox + centroid present), `paintPreview` (returns
  thumbnail, does not mutate), `assertPaint` (passing + failing). All 10
  pass.
- `npm run build` clean.
