// Verifies crossSectionFromSVG end-to-end: an SVG path string becomes a
// CrossSection, .extrude() produces a valid manifold, and the resulting
// geometry has expected stats (positive volume, single component).

import { test, expect } from 'playwright/test';

test.describe('crossSectionFromSVG', () => {
  test('console: simple rectangle path extrudes to a box', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const stats = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      const cs = pw.crossSectionFromSVG('M 0 0 L 10 0 L 10 10 L 0 10 Z');
      const area = cs.area();
      // Sandbox blocks partwright.* calls inside model code, so use
      // api.crossSectionFromSVG from the runIsolated body.
      const r = await pw.runIsolated(`
        const cs = api.crossSectionFromSVG('M 0 0 L 10 0 L 10 10 L 0 10 Z');
        return cs.extrude(5);
      `);
      return { area, geometry: r.geometryData };
    });

    expect(stats.area).toBeCloseTo(100, 1); // 10x10 = 100
    expect(stats.geometry.status).toBe('ok');
    expect(stats.geometry.componentCount).toBe(1);
    expect(stats.geometry.volume).toBeCloseTo(500, 0); // 10x10x5 = 500
  });

  test('sandbox: api.crossSectionFromSVG works with curves', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const ran = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      // Wing-like profile: leading edge straight, trailing edge curved.
      return pw.run(`
        const profile = api.crossSectionFromSVG(
          "M 0 0 L 40 0 C 40 8 30 12 0 10 Z",
          { curveSegments: 24 }
        );
        return profile.extrude(2);
      `);
    });
    expect(ran.error, ran.error ? ran.error : 'expected clean run').toBeUndefined();

    const stats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).partwright.getGeometryData();
    });
    expect(stats.status).toBe('ok');
    expect(stats.componentCount).toBe(1);
    expect(stats.volume).toBeGreaterThan(100); // sanity: nontrivial area * 2
  });

  test('arc command parses without throwing', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    // Circle drawn as two semicircle arcs.
    const stats = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      const cs = pw.crossSectionFromSVG('M -10 0 A 10 10 0 0 1 10 0 A 10 10 0 0 1 -10 0 Z');
      return { area: cs.area(), numContour: cs.numContour() };
    });
    expect(stats.numContour).toBe(1);
    // Area of a circle of radius 10 is ~314.16; sampling will undershoot
    // slightly. Generous tolerance because the arc sampler intentionally
    // trades accuracy for speed.
    expect(stats.area).toBeGreaterThan(280);
    expect(stats.area).toBeLessThan(320);
  });

  test('invalid path string surfaces an instructive error', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const errored = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      try {
        pw.crossSectionFromSVG('');
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    });
    expect(errored).toBeTruthy();
    expect(errored).toMatch(/non-empty SVG path string/i);
  });
});
