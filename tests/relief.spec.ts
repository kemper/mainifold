// Relief Studio (HueForge-style) smoke coverage: generating a relief from an
// in-page image via the console API, the optical preview + swap guide round
// trip, and the toolbar entry points. No external network or files (a gradient
// canvas stands in for an imported image).

import { test, expect, type Page } from 'playwright/test';

async function waitForEngine(page: Page) {
  await page.waitForSelector('text=Ready', { timeout: 20_000 });
  await page.waitForFunction(
    () => !!(window as unknown as { partwright?: { run?: unknown } }).partwright?.run,
    { timeout: 20_000 },
  );
}

test.describe('Relief Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('partwright-tour-completed', '1'));
  });

  test('generates a relief from an image and produces a swap guide', async ({ page }) => {
    await page.goto('/editor');
    await waitForEngine(page);

    const result = await page.evaluate(async () => {
      const pw = (window as unknown as { partwright: Record<string, (...a: unknown[]) => unknown> }).partwright;
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      // Horizontal grayscale gradient → a smooth tonal relief.
      const img = ctx.createImageData(64, 64);
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const v = Math.floor((x / 63) * 255);
          const o = (y * 64 + x) * 4;
          img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const src = c.toDataURL('image/png');

      const created = await pw.importImageAsRelief({ src, mode: 'luminance', options: { resolution: 48 } }) as { sessionId?: string; error?: string };
      const geo = pw.getGeometryData() as { triangleCount?: number; isManifold?: boolean } | null;
      const previewOk = pw.setReliefPreviewMode('single-nozzle') as { ok?: boolean; error?: string };
      const guide = pw.getReliefSwapGuide() as { swaps?: unknown[]; bands?: unknown[]; error?: string };
      return { created, triangleCount: geo?.triangleCount ?? 0, isManifold: geo?.isManifold ?? false, previewOk, guide };
    });

    expect(result.created.error).toBeFalsy();
    expect(result.created.sessionId).toBeTruthy();
    expect(result.triangleCount).toBeGreaterThan(0);
    expect(result.isManifold).toBe(true);
    expect(result.previewOk.ok).toBe(true);
    expect(result.guide.error).toBeFalsy();
    expect(Array.isArray(result.guide.bands)).toBe(true);
  });

  test('toolbar exposes the relief entry points', async ({ page }) => {
    await page.goto('/editor');
    await waitForEngine(page);

    await expect(page.locator('#btn-relief')).toBeVisible();

    await page.locator('#btn-import').click();
    await expect(page.getByText('Image → Relief (HueForge)…')).toBeVisible();
  });
});
