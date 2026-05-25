// Unit tests for the brush footprint signed-distance field (the basis of the
// in/out test and the boundary-conforming clip). Pure geometry — no browser.

import { describe, test, expect } from 'vitest';
import { strokeSignedDist, airbrushCoverage, airbrushDither, type BrushStroke, type AirbrushStroke } from '../../src/color/subdivide';

const at = (s: BrushStroke, p: [number, number, number]) => strokeSignedDist(p[0], p[1], p[2], s);

describe('strokeSignedDist', () => {
  test('legacy circle: signed distance to a sphere of radius r', () => {
    const s: BrushStroke = { samples: [[0, 0, 0]], radius: 2, shape: 'circle', maxEdge: 0.1 };
    expect(at(s, [0, 0, 0])).toBeCloseTo(-2);   // centre, r inside
    expect(at(s, [2, 0, 0])).toBeCloseTo(0);     // on the boundary
    expect(at(s, [3, 0, 0])).toBeCloseTo(1);     // outside
  });

  test('legacy square: Chebyshev box, corners are inside (not clipped to a sphere)', () => {
    const s: BrushStroke = { samples: [[0, 0, 0]], radius: 2, shape: 'square', maxEdge: 0.1 };
    expect(at(s, [1.9, 1.9, 0])).toBeLessThan(0);   // near a corner — inside the box
    expect(at(s, [2.1, 0, 0])).toBeGreaterThan(0);  // just past a face — outside
  });

  test('legacy diamond: L1 ball', () => {
    const s: BrushStroke = { samples: [[0, 0, 0]], radius: 2, shape: 'diamond', maxEdge: 0.1 };
    expect(at(s, [1, 0.9, 0])).toBeLessThan(0);     // |1|+|0.9| = 1.9 < 2 → inside
    expect(at(s, [1.2, 1.2, 0])).toBeGreaterThan(0); // 2.4 > 2 → outside
  });

  test('slab circle: cylinder — gated by depth along the normal', () => {
    const s: BrushStroke = {
      samples: [[0, 0, 0]], radius: 2, shape: 'circle', maxEdge: 0.1,
      surface: 'slab', depth: 1, sampleNormals: [[0, 0, 1]],
    };
    expect(at(s, [1, 0, 0])).toBeLessThan(0);    // on the surface, within radius
    expect(at(s, [0, 0, 0.5])).toBeLessThan(0);  // within depth through the wall
    expect(at(s, [0, 0, 1.5])).toBeGreaterThan(0); // beyond depth → outside the slab
    expect(at(s, [2.5, 0, 0])).toBeGreaterThan(0); // beyond radius → outside laterally
  });

  test('union over samples takes the nearest footprint', () => {
    const s: BrushStroke = { samples: [[0, 0, 0], [10, 0, 0]], radius: 2, shape: 'circle', maxEdge: 0.1 };
    expect(at(s, [10, 0, 0])).toBeCloseTo(-2);   // inside the second sample
    expect(at(s, [5, 0, 0])).toBeGreaterThan(0); // between, outside both
  });
});

describe('airbrush', () => {
  const stroke = (over: Partial<AirbrushStroke> = {}): AirbrushStroke =>
    ({ samples: [[0, 0, 0]], radius: 10, strength: 1, softness: 0.5, seed: 1, maxEdge: 0.5, ...over });

  test('coverage: full in the core, fades across the feather, zero past the radius', () => {
    const s = stroke(); // core = 5 (softness 0.5), radius 10
    expect(airbrushCoverage(0, s)).toBeCloseTo(1);    // centre
    expect(airbrushCoverage(5, s)).toBeCloseTo(1);    // edge of solid core
    expect(airbrushCoverage(7.5, s)).toBeCloseTo(0.5); // mid-feather
    expect(airbrushCoverage(10, s)).toBe(0);          // radius
    expect(airbrushCoverage(12, s)).toBe(0);          // beyond
  });

  test('strength scales coverage; lower softness widens the solid core', () => {
    expect(airbrushCoverage(0, stroke({ strength: 0.4 }))).toBeCloseTo(0.4);
    // softness 0.1 → core = 9, so d=8 is still solid; softness 0.9 → core = 1, d=8 is deep feather
    expect(airbrushCoverage(8, stroke({ softness: 0.1 }))).toBeCloseTo(1);
    expect(airbrushCoverage(8, stroke({ softness: 0.9 }))).toBeLessThan(0.5);
  });

  test('dither is deterministic and ~uniform in [0,1)', () => {
    expect(airbrushDither(1.23, 4.56, 7.89, 1)).toBe(airbrushDither(1.23, 4.56, 7.89, 1)); // stable
    expect(airbrushDither(1.23, 4.56, 7.89, 1)).not.toBe(airbrushDither(1.23, 4.56, 7.89, 2)); // seed matters
    let sum = 0; const N = 4000;
    for (let i = 0; i < N; i++) { const v = airbrushDither(i * 0.013, i * 0.029, 0, 7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); sum += v; }
    expect(sum / N).toBeGreaterThan(0.45); // mean ≈ 0.5 (well-distributed)
    expect(sum / N).toBeLessThan(0.55);
  });

  test('coverage is monotonic in strength (the dither superset → non-flaky tests)', () => {
    const lo = stroke({ strength: 0.5 }), hi = stroke({ strength: 0.9 });
    for (const d of [0, 3, 6, 9]) expect(airbrushCoverage(d, hi)).toBeGreaterThanOrEqual(airbrushCoverage(d, lo));
  });
});
