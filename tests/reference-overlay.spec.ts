// Verifies reference-image overlay + probeImage + previewExpression
// end-to-end. Renders should composite an attached photo; probeImage
// should produce normalized coordinates from a known image; and
// previewExpression should isolate one sub-expression of the current
// editor code without saving a version.

import { test, expect } from 'playwright/test';

// A 4x4 pure-red PNG, base64 encoded. Small enough to be a sentinel —
// any composite with referenceOpacity > 0 should brighten the rendered
// PNG noticeably.
const RED_PNG_4x4 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8DwH4iZGBgYGBgYAAAyAwHBAJjJzwAAAABJRU5ErkJggg==';

test.describe('reference image overlay', () => {
  test('renderView with referenceImageId returns a data URL', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const dataUrl = await page.evaluate(async (src) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      const [img] = pw.setImages([{ src, label: 'Front' }]);
      return pw.renderView({
        elevation: 0, azimuth: 0, ortho: true, size: 64,
        referenceImageId: img.id,
        referenceOpacity: 0.5,
      });
    }, RED_PNG_4x4);

    expect(typeof dataUrl).toBe('string');
    expect(dataUrl).toMatch(/^data:image\/png/);
  });

  test('unknown referenceImageId throws', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const errored = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      try {
        await pw.renderView({ referenceImageId: 'does-not-exist' });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    });
    expect(errored).toMatch(/does-not-exist/);
  });
});

test.describe('probeImage', () => {
  test('returns normalized coordinates for a 4x4 image', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const result = await page.evaluate(async (src) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      const [img] = pw.setImages([{ src }]);
      return pw.probeImage({ pixel: [2, 1], imageId: img.id });
    }, RED_PNG_4x4);

    expect(result).not.toBeNull();
    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(4);
    expect(result.normalized[0]).toBeCloseTo(0.5, 5);
    expect(result.normalized[1]).toBeCloseTo(0.25, 5);
  });

  test('returns null for unknown imageId', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.probeImage({ pixel: [0, 0], imageId: 'missing' });
    });
    expect(result).toBeNull();
  });
});

test.describe('previewExpression', () => {
  test('renders an isolated sub-expression without saving', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    // Load a tiny editor program that defines two helpers and assembles.
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      pw.setCode(`
        const { Manifold } = api;
        const makeWing = () => Manifold.cube([10, 2, 0.5]);
        const makeFin = () => Manifold.cube([1, 5, 3]);
        return makeWing().add(makeFin());
      `);
      await pw.run();
    });

    // Preview makeWing in isolation — should be a thin slab, smaller
    // volume than the assembled model.
    const wing = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.previewExpression('makeWing()');
    });
    expect(wing.geometryData.status).toBe('ok');
    expect(wing.geometryData.componentCount).toBe(1);
    expect(wing.geometryData.volume).toBeCloseTo(10, 0); // 10 * 2 * 0.5
    expect(wing.thumbnail).toMatch(/^data:image\/png/);

    // Preview the fin in isolation — different volume.
    const fin = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.previewExpression('makeFin()');
    });
    expect(fin.geometryData.volume).toBeCloseTo(15, 0); // 1 * 5 * 3
  });
});
