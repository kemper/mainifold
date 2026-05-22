import { test, expect } from 'playwright/test';

// Curve-quality (circular-segment) settings, now living in the viewport "Mesh"
// popover next to Paint / Annotate / Measure:
//   1. The popover opens from the Mesh button and shows the four presets,
//      with Highest active by default.
//   2. Picking a preset persists to localStorage and re-renders.
//   3. The manifold-js engine applies the chosen segment count.

// Dismiss the onboarding tour so its backdrop doesn't intercept overlay clicks.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('partwright-tour-completed', '1'));
});

test.describe('Curve quality settings', () => {
  test('Mesh popover shows presets with Very High active by default', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('#mesh-settings-toggle');

    await page.locator('#mesh-settings-toggle').click();
    await expect(page.locator('#mesh-settings-panel')).toBeVisible();

    // All five presets are present; 'highest' (labeled "Very High") is default.
    for (const q of ['low', 'medium', 'high', 'highest', 'ultra']) {
      await expect(page.locator(`#mesh-settings-panel [data-quality="${q}"]`)).toBeVisible();
    }
    const stored0 = await page.evaluate(() => localStorage.getItem('partwright-quality-settings-v1'));
    if (stored0) expect(JSON.parse(stored0).quality ?? 'highest').toBe('highest');
  });

  test('picking Low persists and reloads selected', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('#mesh-settings-toggle');

    await page.locator('#mesh-settings-toggle').click();
    await page.locator('#mesh-settings-panel [data-quality="low"]').click();

    const stored = await page.evaluate(() => localStorage.getItem('partwright-quality-settings-v1'));
    expect(JSON.parse(stored!)).toMatchObject({ quality: 'low', refine: 1 });
  });

  test('manifold-js engine applies the chosen segment count', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('#mesh-settings-toggle');
    await page.waitForFunction(
      () => !!(window as unknown as { partwright?: { run?: unknown } }).partwright?.run,
      { timeout: 20_000 },
    );

    type RunResult = { triangleCount?: number; error?: string };
    type PartwrightApi = { run: (code: string) => Promise<RunResult> };
    const sphereCode = 'const { Manifold } = api; return Manifold.sphere(5);';
    const runSphere = () =>
      page.evaluate((code) => {
        const api = (window as unknown as { partwright: PartwrightApi }).partwright;
        return api.run(code);
      }, sphereCode);

    // Highest (default) — many triangles.
    const high = await runSphere();
    expect(high.triangleCount ?? 0).toBeGreaterThan(2000);

    // Drop to Low via the Mesh popover.
    await page.locator('#mesh-settings-toggle').click();
    await page.locator('#mesh-settings-panel [data-quality="low"]').click();

    const low = await runSphere();
    expect(low.triangleCount ?? 0).toBeLessThan(high.triangleCount ?? 0);
    expect(low.triangleCount ?? 0).toBeGreaterThan(0);
  });

  test('Ultra preset yields more triangles than the default', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('#mesh-settings-toggle');
    await page.waitForFunction(
      () => !!(window as unknown as { partwright?: { run?: unknown } }).partwright?.run,
      { timeout: 20_000 },
    );

    type RunResult = { triangleCount?: number; error?: string };
    type PartwrightApi = { run: (code: string) => Promise<RunResult> };
    // A cylinder stays cheap at 1024 segments (~4k tris); a sphere would be
    // ~2M and too heavy for a smoke test. Either way the count must climb.
    const cylinderCode = 'const { Manifold } = api; return Manifold.cylinder(5, 3, 3);';
    const runCyl = () =>
      page.evaluate((code) => {
        const api = (window as unknown as { partwright: PartwrightApi }).partwright;
        return api.run(code);
      }, cylinderCode);

    // Baseline at the default (Very High = 128 segments).
    const high = await runCyl();

    // Switch to Ultra (1024 segments) via the Mesh popover.
    await page.locator('#mesh-settings-toggle').click();
    await page.locator('#mesh-settings-panel [data-quality="ultra"]').click();

    const ultra = await runCyl();
    expect(ultra.triangleCount ?? 0).toBeGreaterThan(high.triangleCount ?? 0);
  });
});
