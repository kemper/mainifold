// Unit tests for the brush footprint signed-distance field (the basis of the
// in/out test and the boundary-conforming clip). Pure geometry — no browser.

import { describe, test, expect } from 'vitest';
import { strokeSignedDist, type BrushStroke } from '../../src/color/subdivide';

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
