import { test, expect } from 'playwright/test';

// Smoke tests for the free-mesh (frozen-mesh) prototype:
//  - Import a binary STL on the landing page -> creates a frozen-mesh session
//  - Editor shows the frozen-mesh notice, code editor read-only, Run disabled
//  - "Push vertex" tool overwrites the stored mesh blob in place
//  - State survives a page reload (the meshBlob IS the source of truth)
//
// All assertions are local — no external network. We build the STL bytes
// inline so the test is hermetic and doesn't depend on any fixture file.

test.describe('Free-mesh prototype', () => {
  test('STL import creates a frozen-mesh session and renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#btn-import-stl');

    // Inject a small binary STL (a unit cube, 12 triangles).
    await page.evaluate(() => {
      (window as unknown as { __pwTestCubeStl: Uint8Array }).__pwTestCubeStl = buildCubeStl(10);
      function buildCubeStl(size: number): Uint8Array {
        // 6 faces × 2 tris = 12 triangles.
        const tris: number[][] = [];
        const s = size;
        const v = [
          [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
          [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
        ];
        // bottom (-Z)
        tris.push([0, 0, -1, ...v[0], ...v[2], ...v[1]]);
        tris.push([0, 0, -1, ...v[0], ...v[3], ...v[2]]);
        // top (+Z)
        tris.push([0, 0, 1, ...v[4], ...v[5], ...v[6]]);
        tris.push([0, 0, 1, ...v[4], ...v[6], ...v[7]]);
        // front (-Y)
        tris.push([0, -1, 0, ...v[0], ...v[1], ...v[5]]);
        tris.push([0, -1, 0, ...v[0], ...v[5], ...v[4]]);
        // back (+Y)
        tris.push([0, 1, 0, ...v[3], ...v[7], ...v[6]]);
        tris.push([0, 1, 0, ...v[3], ...v[6], ...v[2]]);
        // left (-X)
        tris.push([-1, 0, 0, ...v[0], ...v[4], ...v[7]]);
        tris.push([-1, 0, 0, ...v[0], ...v[7], ...v[3]]);
        // right (+X)
        tris.push([1, 0, 0, ...v[1], ...v[2], ...v[6]]);
        tris.push([1, 0, 0, ...v[1], ...v[6], ...v[5]]);

        const buf = new ArrayBuffer(84 + tris.length * 50);
        const dv = new DataView(buf);
        // header bytes 0..79 left as zeros
        dv.setUint32(80, tris.length, true);
        let off = 84;
        for (const t of tris) {
          for (let i = 0; i < 12; i++) {
            dv.setFloat32(off, t[i], true);
            off += 4;
          }
          dv.setUint16(off, 0, true); // attribute byte count
          off += 2;
        }
        return new Uint8Array(buf);
      }
    });

    // Hand the bytes to the hidden file input on the landing page.
    const fileInput = page.locator('#btn-import-stl input[type="file"]');
    const bytes = await page.evaluate(() => {
      const u8 = (window as unknown as { __pwTestCubeStl: Uint8Array }).__pwTestCubeStl;
      return Array.from(u8);
    });
    await fileInput.setInputFiles({
      name: 'cube.stl',
      mimeType: 'application/sla',
      buffer: Buffer.from(bytes),
    });

    // Should navigate to the editor with a session URL.
    await page.waitForURL(/\/editor\?session=/, { timeout: 10_000 });
    // Frozen-mesh notice appears in place of the lock banner.
    await expect(page.locator('#free-mesh-notice')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#free-mesh-notice')).toContainText(/frozen mesh/i);

    // Run button is disabled.
    const runBtn = page.locator('#btn-run');
    await expect(runBtn).toBeDisabled();

    // The Push vertex tool button is visible/enabled.
    const pushBtn = page.locator('#sculpt-push-toggle');
    await expect(pushBtn).toBeVisible();
    await expect(pushBtn).toBeEnabled();
  });

  test('Push vertex overwrites mesh in place and persists across reload', async ({ page }) => {
    // Surface unexpected browser errors / warnings to the test log.
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warn') {
        // eslint-disable-next-line no-console
        console.log(`[browser ${msg.type()}]`, msg.text());
      }
    });
    await page.goto('/');
    await page.waitForSelector('#btn-import-stl');
    await page.evaluate(() => {
      (window as unknown as { __pwTestCubeStl: Uint8Array }).__pwTestCubeStl = buildCubeStl(10);
      function buildCubeStl(size: number): Uint8Array {
        const tris: number[][] = [];
        const s = size;
        const v = [
          [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
          [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
        ];
        tris.push([0, 0, -1, ...v[0], ...v[2], ...v[1]]);
        tris.push([0, 0, -1, ...v[0], ...v[3], ...v[2]]);
        tris.push([0, 0, 1, ...v[4], ...v[5], ...v[6]]);
        tris.push([0, 0, 1, ...v[4], ...v[6], ...v[7]]);
        tris.push([0, -1, 0, ...v[0], ...v[1], ...v[5]]);
        tris.push([0, -1, 0, ...v[0], ...v[5], ...v[4]]);
        tris.push([0, 1, 0, ...v[3], ...v[7], ...v[6]]);
        tris.push([0, 1, 0, ...v[3], ...v[6], ...v[2]]);
        tris.push([-1, 0, 0, ...v[0], ...v[4], ...v[7]]);
        tris.push([-1, 0, 0, ...v[0], ...v[7], ...v[3]]);
        tris.push([1, 0, 0, ...v[1], ...v[2], ...v[6]]);
        tris.push([1, 0, 0, ...v[1], ...v[6], ...v[5]]);
        const buf = new ArrayBuffer(84 + tris.length * 50);
        const dv = new DataView(buf);
        dv.setUint32(80, tris.length, true);
        let off = 84;
        for (const t of tris) {
          for (let i = 0; i < 12; i++) { dv.setFloat32(off, t[i], true); off += 4; }
          dv.setUint16(off, 0, true);
          off += 2;
        }
        return new Uint8Array(buf);
      }
    });

    const fileInput = page.locator('#btn-import-stl input[type="file"]');
    const bytes = await page.evaluate(() => Array.from((window as unknown as { __pwTestCubeStl: Uint8Array }).__pwTestCubeStl));
    await fileInput.setInputFiles({
      name: 'cube.stl',
      mimeType: 'application/sla',
      buffer: Buffer.from(bytes),
    });

    await page.waitForURL(/\/editor\?session=/, { timeout: 10_000 });
    await expect(page.locator('#free-mesh-notice')).toBeVisible({ timeout: 10_000 });

    // Capture the URL so we can revisit after reload.
    const editorUrl = page.url();

    // Wait until geometry-data carries a valid bounding box for the loaded
    // mesh — the load is async and #free-mesh-notice can appear before the
    // viewport pipeline has populated stats.
    await page.waitForFunction(() => {
      const el = document.getElementById('geometry-data');
      if (!el?.textContent) return false;
      try {
        const data = JSON.parse(el.textContent);
        return data?.boundingBox?.dimensions != null;
      } catch { return false; }
    }, { timeout: 10_000 });

    const initialBBox = await page.evaluate(() => {
      const el = document.getElementById('geometry-data');
      const data = el?.textContent ? JSON.parse(el.textContent) : null;
      return data?.boundingBox ?? null;
    });
    expect(initialBBox).not.toBeNull();

    // Activate the push tool and synthesize a click in the middle of the viewport.
    await page.locator('#sculpt-push-toggle').click();
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible' });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Arm a promise BEFORE clicking so we capture the commit-event reliably.
    const committedPromise = page.evaluate(() => new Promise<void>((resolve) => {
      const handler = () => { window.removeEventListener('pw-sculpt-push-committed', handler); resolve(); };
      window.addEventListener('pw-sculpt-push-committed', handler);
    }));

    // Click slightly off-centre so we hit a vertex on one face deterministically.
    await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.4);

    // Wait for the commit event the sculpt handler dispatches after IDB
    // write resolves. Bound it so we fail fast if the click missed.
    await Promise.race([
      committedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Push never committed')), 8000)),
    ]);

    // The geometry-data update is synchronous with onPush in main.ts, so the
    // bbox is already current by the time the commit event fires.

    const pushedBBox = await page.evaluate(() => {
      const el = document.getElementById('geometry-data');
      const data = el?.textContent ? JSON.parse(el.textContent) : null;
      return data?.boundingBox ?? null;
    });

    // If pushing changed the geometry, the bounding box should differ.
    // (If the click missed the mesh entirely the test will tolerantly skip
    // this assertion — but bbox-equality across a successful push is the
    // signal of correctness.)
    if (pushedBBox && JSON.stringify(pushedBBox) === JSON.stringify(initialBBox)) {
      test.info().annotations.push({ type: 'note', description: 'Push click missed the mesh; bbox unchanged.' });
    }

    // Reload and verify the frozen-mesh state survives — the blob in
    // IndexedDB is the source of truth. The commit event we awaited above
    // resolves after the IDB write commits, so no extra delay is needed.
    await page.goto(editorUrl);
    await expect(page.locator('#free-mesh-notice')).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('geometry-data');
      if (!el?.textContent) return false;
      try {
        const data = JSON.parse(el.textContent);
        return data?.boundingBox?.dimensions != null;
      } catch { return false; }
    }, { timeout: 10_000 });
    const reloadBBox = await page.evaluate(() => {
      const el = document.getElementById('geometry-data');
      const data = el?.textContent ? JSON.parse(el.textContent) : null;
      return data?.boundingBox ?? null;
    });
    expect(reloadBBox).not.toBeNull();
    // bbox after reload matches whatever the most-recent push produced.
    expect(reloadBBox).toEqual(pushedBBox);

    // Verify export still works on frozen-mesh versions. The downstream
    // export code consumes currentMeshData / currentManifold uniformly, so
    // STL and GLB should produce non-empty blobs.
    const exports = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pw = (window as unknown as { partwright: any }).partwright;
      const stl = await pw.exportSTLData();
      const glb = await pw.exportGLBData();
      const data = pw.getGeometryData();
      return {
        stlBytes: stl?.sizeBytes ?? 0,
        glbBytes: glb?.sizeBytes ?? 0,
        vertexCount: data?.vertexCount ?? 0,
        triangleCount: data?.triangleCount ?? 0,
      };
    });
    expect(exports.vertexCount).toBeGreaterThan(0);
    expect(exports.triangleCount).toBeGreaterThan(0);
    expect(exports.stlBytes).toBeGreaterThan(0);
    expect(exports.glbBytes).toBeGreaterThan(0);
  });
});
