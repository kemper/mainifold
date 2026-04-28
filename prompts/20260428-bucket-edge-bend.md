---
session: "bucket-edge-bend"
timestamp: "2026-04-28T20:50:00Z"
model: claude-opus-4-7
tools: [Edit, Bash]
---

## Human

Bucket tolerance currently caps at 90° and uses seed-deviation: every face's
normal is compared against the original seed face. That means a cylinder side
can never flood-fill completely. Switch to edge-bend semantics (compare
neighbor vs. parent face) and extend the slider to 180°.

## Assistant

### Key decisions

- `findCoplanarRegion` now reads the *current* (parent) triangle's normal
  inside the BFS loop and compares each neighbor against that, instead of
  using a fixed seed normal captured before the loop. Same dot-product check;
  one less captured variable; the difference is purely about *which* normal
  the neighbor is compared against.
- Tolerance range widens from `[0, 1]` to `[-1, 1]` because 180° → cos = -1.
  `setBucketTolerance` clamps to the new range.
- Slider 0..100 maps linearly to 0°..180°. The slider value-display already
  showed `≤ N°` so no UI restructure was needed; only the conversion math
  changed.
- Help-line copy changed from "Strict ↔ Loose (more curved bleed)" to
  "Coplanar only ↔ Whole connected mesh" — this conveys the new semantics
  more accurately.
- `public/ai.md` now documents the parent-vs-neighbor check explicitly with a
  worked cylinder example so AI agents tuning `tolerance` understand the
  geometry.
