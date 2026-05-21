// Import-detail (mesh reduction) step:
//  - A heavy manifold STL (> 20k triangles) triggers the "Import detail" modal.
//  - Choosing a reduction simplifies the stored mesh (a subdivided cube's flat
//    faces collapse back toward the minimal triangulation).
//  - Choosing "Full detail" keeps every triangle — and confirms imports are
//    exempt from the global mesh-detail refine factor (count is unchanged, not
//    multiplied).

import { test, expect } from 'playwright/test';

/** Binary STL of a cube (side 2·s) whose 6 faces are each subdivided into an
 *  n×n grid → 12·n² triangles, all coplanar per face so simplify can collapse
 *  them. n=42 → 21,168 triangles, just over the 20k import-detail threshold. */
function buildSubdividedCubeSTLBase64(n = 42, s = 5): string {
  // Each face: a constant axis + two in-plane axes whose cross product points
  // outward, so every triangle is wound consistently (required for a manifold).
  const faces: { axis: number; val: number; u: number; v: number }[] = [
    { axis: 0, val: s, u: 1, v: 2 },
    { axis: 0, val: -s, u: 2, v: 1 },
    { axis: 1, val: s, u: 2, v: 0 },
    { axis: 1, val: -s, u: 0, v: 2 },
    { axis: 2, val: s, u: 0, v: 1 },
    { axis: 2, val: -s, u: 1, v: 0 },
  ];
  const pt = (f: typeof faces[0], i: number, j: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[f.axis] = f.val;
    p[f.u] = -s + (i / n) * 2 * s;
    p[f.v] = -s + (j / n) * 2 * s;
    return p;
  };
  const tris: [number, number, number][][] = [];
  for (const f of faces) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = pt(f, i, j);
        const b = pt(f, i + 1, j);
        const c = pt(f, i + 1, j + 1);
        const d = pt(f, i, j + 1);
        tris.push([a, b, c]);
        tris.push([a, c, d]);
      }
    }
  }

  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const tri of tris) {
    off += 12; // normal left zero
    for (const vert of tri) {
      view.setFloat32(off, vert[0], true); off += 4;
      view.setFloat32(off, vert[1], true); off += 4;
      view.setFloat32(off, vert[2], true); off += 4;
    }
    view.setUint16(off, 0, true); off += 2;
  }
  return Buffer.from(new Uint8Array(buf)).toString('base64');
}

const TRIS = 42 * 42 * 12; // 21,168

async function importCube(page: import('playwright/test').Page): Promise<void> {
  // Use the AI-agent URL: it skips the onboarding tour (whose backdrop would
  // intercept modal clicks) and the simplify step needs the WASM engine ready,
  // which `partwright.run` existing guarantees.
  await page.goto('/editor?view=ai');
  await page.waitForFunction(
    () => !!(window as unknown as { partwright?: { run?: unknown } }).partwright?.run,
    { timeout: 20_000 },
  );
  const fileInput = page.locator('#import-wrapper input[type="file"]');
  await fileInput.setInputFiles({
    name: 'dense-cube.stl',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(buildSubdividedCubeSTLBase64(), 'base64'),
  });
  await expect(page.getByRole('heading', { name: 'Import detail' })).toBeVisible();
}

async function geometry(page: import('playwright/test').Page) {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).partwright?.getCode?.() ?? '').includes('Manifold.ofMesh(api.imports[0])'),
    undefined,
    { timeout: 15000 },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).partwright.getGeometryData());
}

test.describe('Import detail reduction', () => {
  test('a heavy STL offers reduction and the chosen reduction shrinks the mesh', async ({ page }) => {
    await importCube(page);

    // The modal reports the original triangle count (Full-detail row).
    await expect(page.getByText(`${TRIS.toLocaleString()} tris`)).toBeVisible();

    await page.locator('input[type=radio][value=strong]').check();
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const geo = await geometry(page);
    expect(geo.triangleCount).toBeLessThan(2000); // flat faces collapse toward 12
    expect(geo.triangleCount).toBeGreaterThan(0);
    expect(geo.volume).toBeGreaterThan(900); // shape preserved within tolerance
    expect(geo.volume).toBeLessThan(1100);
  });

  test('Full detail keeps every triangle (imports are exempt from global refine)', async ({ page }) => {
    await importCube(page);

    // Default selection is Full detail — import without reducing.
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    const geo = await geometry(page);
    expect(geo.triangleCount).toBe(TRIS); // not reduced, and not 4x'd by refine
  });
});
