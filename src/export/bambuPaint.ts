// Bambu Studio / OrcaSlicer per-triangle color is stored as a `paint_color`
// attribute holding an MMU-segmentation bitstream (NOT the standard 3MF
// `m:colorgroup`). The bitstream mirrors PrusaSlicer's
// `TriangleSelector::serialize`: a recursive quad-tree of triangle splits, each
// leaf carrying a paint "state". We only ever emit *leaf* triangles (one
// uniform color per triangle — we never subdivide), which is the simplest case
// of the format:
//
//   a leaf nibble is LSB-first: [split0, split1, state0, state1]
//   - leaf  → split bits = 00
//   - state = extruder - 1  (the painted-color index; extruder 1 is the default)
//   - state 0 → unpainted              → no attribute at all
//   - state 1 → 2 state-bits 01        → nibble 0x4 → "4"   (1st painted color)
//   - state 2 → 2 state-bits 10        → nibble 0x8 → "8"   (2nd painted color)
//   - state ≥3 → 2 state-bits 11 = escape → nibble 0xC → "C", followed by one
//                nibble holding (state - 3)
//
// The default extruder (1) prints every bare (unpainted) triangle, so it carries
// no attribute. The first *painted* color is extruder 2 → state 1 → "4". (An
// earlier version started painted colors at "8", which shifted every slot up by
// one extruder and produced wrong colors in Bambu — see PR history.)

/** The most filaments Bambu Studio supports (AMS slots). Color slots beyond
 *  this can't be represented, and the single-nibble escape below only holds
 *  (state-3) ≤ 15, so we cap here and fail loudly rather than silently wrap. */
export const BAMBU_MAX_FILAMENTS = 16;

/** Encode a single uniformly-painted (non-subdivided) triangle's 1-based
 *  `extruder` index into Bambu/Orca's `paint_color` hex string. Returns '' for
 *  extruder ≤ 1 (the default extruder needs no attribute). The first painted
 *  color is extruder 2 → "4", the second extruder 3 → "8", then the 0xC escape
 *  takes over. Valid for the 1–16 filament range Bambu supports (extruder ≤ 16 ⇒
 *  at most one trailing nibble); throws above that so an over-many-colors model
 *  fails loudly instead of mis-coloring. */
export function encodePaintColor(extruder: number): string {
  if (!Number.isInteger(extruder) || extruder <= 1) return '';
  if (extruder > BAMBU_MAX_FILAMENTS) {
    throw new Error(`Bambu 3MF export supports at most ${BAMBU_MAX_FILAMENTS} filaments (colors); got extruder ${extruder}. Reduce the number of distinct colors.`);
  }
  const state = extruder - 1; // paint state: 1 = first painted color
  if (state === 1) return '4';
  if (state === 2) return '8';
  // state ≥ 3: escape nibble 'C' (split 00 + state-bits 11), then (state-3).
  // For Bambu's ≤16 extruders, (state-3) ≤ 12 → a single hex nibble.
  return 'C' + (state - 3).toString(16).toUpperCase();
}

/** Map a material/colorgroup slot index (0 = the base/default color, 1+ =
 *  painted colors, in `materialColors` order) to its `paint_color` string.
 *  Slot 0 is the part's default extruder (1) and gets no attribute; painted
 *  slot m is extruder (m + 1), so slot 1 → extruder 2 → "4". */
export function paintColorForMaterial(materialIndex: number): string {
  if (materialIndex <= 0) return '';
  return encodePaintColor(materialIndex + 1);
}
