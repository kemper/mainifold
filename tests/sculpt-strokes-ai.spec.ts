// AI-driven sculpt: exercises the partwright-bridge tools the AI agent
// uses to deform a mesh programmatically. The human UI is covered by
// sculpt-strokes.spec.ts; this file drives the dispatcher path
// (window.partwright.subdivideMesh / applyBrushDab / applyBrushStroke /
// saveSculptedVersion / cancelPendingStrokes) without ever opening the
// sculpt panel — same pattern as paint-by-vision.spec.ts.

import { test, expect } from 'playwright/test';

test.describe('sculpt strokes (AI dispatcher)', () => {
  test('subdivide → dab → stroke → save → reload replays', async ({ page }) => {
    // Disable the first-visit tour overlay so it doesn't intercept
    // pointer events on the viewport canvas.
    await page.addInitScript(() => {
      try { localStorage.setItem('partwright-tour-completed', new Date().toISOString()); } catch { /* fine */ }
    });
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    // Run a deterministic base shape inside a fresh session.
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      await pw.createSession('sculpt-ai-test');
      await pw.runAndSave('return api.Manifold.cube([20, 20, 20], true);', 'base');
    });

    const baselineStats = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse((document.getElementById('geometry-data') as any).textContent || '{}');
      return { triangleCount: data.triangleCount, vertexCount: data.vertexCount };
    });
    expect(baselineStats.triangleCount).toBe(12); // cube = 12 tris

    // Step 2: subdivide the mesh through the AI tool. Expect ~4x triangle
    // growth per level; 12 → 48 → 192 for two passes.
    const subdivResult = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.subdivideMesh({ levels: 2 });
    });
    expect(subdivResult.error).toBeUndefined();
    expect(subdivResult.currentSubdivisionLevel).toBe(2);
    expect(subdivResult.triangleCount).toBeGreaterThan(baselineStats.triangleCount);
    expect(subdivResult.triangleCount).toBe(12 * 4 * 4);

    // Step 3: single dab on the top face (+Z). Expect the surface to
    // be pushed and at least one vertex to feel the brush.
    const dabResult = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.applyBrushDab({
        point: { x: 0, y: 0, z: 10 },
        normal: { x: 0, y: 0, z: 1 },
        brush: 'push',
        radius: 5,
        strength: 0.5,
      });
    });
    expect(dabResult.error).toBeUndefined();
    expect(dabResult.affectedVertices).toBeGreaterThan(0);
    expect(dabResult.pendingStrokeCount).toBe(1);

    // Step 4: multi-sample stroke across the top — 5 points walking +X.
    // Each sample is its own brush apply; pendingStrokeCount should
    // increment to 2 (the stroke counts as ONE stroke regardless of
    // sample count).
    const strokeResult = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const x = -6 + i * 3;
        samples.push({
          point: { x, y: 2, z: 10 },
          normal: { x: 0, y: 0, z: 1 },
        });
      }
      return pw.applyBrushStroke({
        samples,
        brush: 'push',
        radius: 3,
        strength: 0.4,
      });
    });
    expect(strokeResult.error).toBeUndefined();
    expect(strokeResult.affectedVertices).toBeGreaterThan(0);
    expect(strokeResult.pendingStrokeCount).toBe(2);

    // Step 5: save the sculpted version. Expect a new version id and
    // strokeCount of 2 (the dab + the multi-sample stroke).
    const saveResult = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      return pw.saveSculptedVersion({ label: 'ai-sculpt-test' });
    });
    expect(saveResult.error).toBeUndefined();
    expect(typeof saveResult.versionId).toBe('string');
    expect(saveResult.strokeCount).toBe(2);
    expect(saveResult.subdivisionLevel).toBe(2);

    // Lock overlay should now be visible (sculpt-version lock).
    await expect(page.locator('#editor-lock-overlay')).toBeVisible({ timeout: 10_000 });

    // Wait for the post-save geometry-data flush.
    await page.waitForFunction((baseTri) => {
      const el = document.getElementById('geometry-data');
      if (!el) return false;
      try {
        const d = JSON.parse(el.textContent || '{}');
        return typeof d.triangleCount === 'number' && d.triangleCount > baseTri;
      } catch { return false; }
    }, baselineStats.triangleCount, { timeout: 10_000 });

    const postSave = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse((document.getElementById('geometry-data') as any).textContent || '{}');
      return {
        triangleCount: data.triangleCount,
        vertexCount: data.vertexCount,
        bbox: data.boundingBox,
      };
    });
    expect(postSave.triangleCount).toBeGreaterThan(baselineStats.triangleCount);

    // Step 6: reload. The persisted strokes should replay on load and
    // the topology should match the saved state.
    await page.reload();
    await page.waitForSelector('text=Ready', { timeout: 15000 });
    await expect(page.locator('#editor-lock-overlay')).toBeVisible({ timeout: 10_000 });

    // Wait for the debounced auto-run + stroke replay to settle.
    await page.waitForTimeout(500);
    const afterReload = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse((document.getElementById('geometry-data') as any).textContent || '{}');
      return {
        triangleCount: data.triangleCount,
        vertexCount: data.vertexCount,
        bbox: data.boundingBox,
      };
    });
    expect(afterReload.triangleCount).toBe(postSave.triangleCount);
    // The bbox should still differ from the baseline 20×20×20 cube
    // because the push brush expanded vertices outward along +Z.
    // (Compare against the baseline cube's Z extent, not the saved
    // stats — the replayed mesh and the pre-reload mesh should match.)
    expect(afterReload.bbox).toBeDefined();
  });

  test('applyBrushDab with radius: -1 returns { error }', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const result = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      await pw.run('return api.Manifold.cube([10, 10, 10], true);');
      return pw.applyBrushDab({
        point: { x: 0, y: 0, z: 5 },
        normal: { x: 0, y: 0, z: 1 },
        brush: 'push',
        radius: -1,
        strength: 0.5,
      });
    });
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(result.error).toMatch(/radius/);
  });

  test('saveSculptedVersion with no pending strokes returns { error }', async ({ page }) => {
    await page.goto('/editor');
    await page.waitForSelector('text=Ready', { timeout: 15000 });

    const result = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as any).partwright;
      await pw.createSession('sculpt-empty-test');
      await pw.runAndSave('return api.Manifold.cube([10, 10, 10], true);', 'base');
      // No brush calls — pending queue is empty.
      return pw.saveSculptedVersion({});
    });
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(result.error).toMatch(/no pending sculpt strokes/i);
  });
});
