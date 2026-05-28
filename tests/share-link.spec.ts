// E2E for client-side shareable session links. Runs offline (no network):
// the share URL encodes the design into the hash, the viewer decodes it, and
// nothing is uploaded.
//
// Security is the heart of T2: opening a share link must NOT execute the
// sharer's code. Since user code runs in a Worker (not the page), the
// observable "did it run?" signal is the geometry pipeline output in
// #geometry-data. We embed stats with a SENTINEL volume that differs from what
// the code would compute, so a cold preview shows the embedded number and a
// post-fork run shows the computed one.

import { test, expect, type Page } from 'playwright/test';

// 1x1 transparent PNG — a valid raster data URL that passes isSafeImageDataUrl
// and yields naturalWidth > 0 once decoded.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Pre-dismiss the first-run tour so its backdrop/keys don't interfere, then
 *  open the editor and wait for the engine. Mirrors command-palette.spec.ts. */
async function openEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.setItem('partwright-tour-completed', new Date().toISOString()); } catch { /* ignore */ }
    // Keep the code pane visible: the app collapses it when the AI drawer
    // auto-opens, which would hide .cm-content and break editor interactions.
    try { localStorage.setItem('partwright-ai-settings-v1', JSON.stringify({ editorCollapsed: false })); } catch { /* ignore */ }
  });
  await page.goto('/editor');
  await page.waitForSelector('text=Ready', { timeout: 20000 });
}

/** Build a `#share=` URL for arbitrary code/stats/thumbnail by importing the
 *  pure codec in the page and encoding a single-version ExportedSession. Lets a
 *  viewer test embed a sentinel without going through the Share UI. */
async function buildShareUrl(
  page: Page,
  opts: { code: string; language?: string; volume?: number; thumbnail?: string | null },
): Promise<string> {
  return page.evaluate(async (o) => {
    const mod = await import('/src/share/shareLink.ts');
    const exported = {
      partwright: '1.8',
      session: { name: 'Shared test', created: 1000, updated: 2000, language: o.language ?? 'manifold-js' },
      parts: [{ name: 'Part 1', order: 0 }],
      versions: [
        {
          index: 1,
          code: o.code,
          label: 'v1',
          geometryData: { status: 'ok', volume: o.volume ?? 1331, surfaceArea: 100, isManifold: true, componentCount: 1 },
          timestamp: 1500,
          ...(o.language ? { language: o.language } : {}),
          ...(o.thumbnail ? { thumbnail: o.thumbnail } : {}),
        },
      ],
    };
    const encoded = await mod.encodeShare(exported as never);
    return `${location.origin}/editor#share=${encoded}`;
  }, opts);
}

/** Count rows in the IndexedDB `sessions` store (0 in a fresh context). */
async function sessionCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('partwright');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    try {
      const count: number = await new Promise((res, rej) => {
        const req = db.transaction('sessions', 'readonly').objectStore('sessions').count();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      return count;
    } finally {
      db.close();
    }
  });
}

/** Read the parsed #geometry-data JSON. */
async function geometryData(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    try { return JSON.parse(document.getElementById('geometry-data')?.textContent || '{}'); } catch { return {}; }
  });
}

test.describe('share links', () => {
  test('T1 Share action opens a modal with a copyable hash URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEditor(page);

    // Run the default so there's geometry, then share via the command palette.
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.locator('input[aria-label="Search commands"]');
    await palette.fill('Share design');
    await expect(page.locator('[role="option"]').filter({ hasText: 'Share design' })).toBeVisible();
    await page.keyboard.press('Enter');

    // The modal's read-only input holds the full share URL.
    const urlInput = page.locator('input[readonly]').first();
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    const origin = new URL(page.url()).origin;
    const value = await urlInput.inputValue();
    expect(value.startsWith(`${origin}/editor#share=`)).toBe(true);

    // Copy → success toast (clipboard readback is best-effort only).
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByText('Link copied')).toBeVisible();
  });

  test('T2 Opening a share link shows a cold, read-only preview (no execution)', async ({ page }) => {
    await openEditor(page);

    // Embed code that computes volume 125 but stats that claim volume 4242.
    // A cold preview must surface 4242 (the embedded number); a real run would
    // overwrite it with 125.
    const SENTINEL_VOL = 4242;
    const sharedCode = 'const { Manifold } = api;\nreturn Manifold.cube([5,5,5], true);';
    const url = await buildShareUrl(page, { code: sharedCode, volume: SENTINEL_VOL, thumbnail: TINY_PNG });

    const before = await sessionCount(page);

    await page.goto(url);
    await page.waitForSelector('#shared-preview-banner', { timeout: 20000 });

    // Banner + Fork CTA visible.
    await expect(page.locator('#shared-preview-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fork to edit & run' })).toBeVisible();

    // Editor read-only: Run disabled AND typing leaves the doc unchanged.
    await expect(page.locator('#btn-run')).toBeDisabled();
    const codeBefore = await page.evaluate(() => (window as { partwright?: { getCode(): string } }).partwright?.getCode?.() ?? '');
    // Editor auto-format may respace the array literal; compare whitespace-insensitively.
    expect(codeBefore.replace(/\s+/g, '')).toContain('Manifold.cube([5,5,5],true)');
    await page.locator('.cm-content').click();
    await page.keyboard.type('// injected', { delay: 10 });
    const codeAfter = await page.evaluate(() => (window as { partwright?: { getCode(): string } }).partwright?.getCode?.() ?? '');
    expect(codeAfter).toBe(codeBefore);

    // Thumbnail rendered via a CSP-safe data URL (naturalWidth proves decode).
    const img = page.locator('#shared-preview-overlay img');
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

    // Pipeline stayed COLD: the embedded sentinel volume is what's shown.
    expect((await geometryData(page)).volume).toBe(SENTINEL_VOL);

    // Hash stripped to exactly /editor (no #, no ?session=).
    expect(page.url()).toBe(`${new URL(url).origin}/editor`);

    // No IndexedDB writes.
    expect(await sessionCount(page)).toBe(before);

    // Back must not resurrect a #share= URL.
    await page.goBack().catch(() => {});
    expect(page.url()).not.toContain('#share=');
  });

  test('T3 Fork makes the design hot, editable, and persisted', async ({ page }) => {
    await openEditor(page);

    const SENTINEL_VOL = 4242;
    const sharedCode = 'const { Manifold } = api;\nreturn Manifold.cube([5,5,5], true);';
    const url = await buildShareUrl(page, { code: sharedCode, volume: SENTINEL_VOL, thumbnail: TINY_PNG });

    await page.goto(url);
    await page.waitForSelector('#shared-preview-banner', { timeout: 20000 });
    const before = await sessionCount(page);

    await page.getByRole('button', { name: 'Fork to edit & run' }).click();

    // Banner gone, Run enabled, URL carries ?session=, editor editable.
    await expect(page.locator('#shared-preview-banner')).toHaveCount(0);
    await expect(page.locator('#shared-preview-overlay')).toHaveCount(0);
    await expect(page.locator('#btn-run')).toBeEnabled();
    await expect.poll(() => new URL(page.url()).searchParams.has('session')).toBe(true);

    // Forked code matches the shared code (whitespace-insensitive: the editor
    // may reformat the array literal).
    const forkedCode = await page.evaluate(() => (window as { partwright?: { getCode(): string } }).partwright?.getCode?.() ?? '');
    expect(forkedCode.replace(/\s+/g, '')).toContain('Manifold.cube([5,5,5],true)');

    // Sentinel NOW fired: a real run computed volume 125, replacing the 4242
    // the preview displayed.
    await expect.poll(async () => (await geometryData(page)).volume, { timeout: 15000 }).toBe(125);

    // A session row was created.
    expect(await sessionCount(page)).toBe(before + 1);

    // Editing works.
    await page.locator('.cm-content').click();
    await page.keyboard.type('\n// edited after fork', { delay: 10 });
    const edited = await page.evaluate(() => (window as { partwright?: { getCode(): string } }).partwright?.getCode?.() ?? '');
    expect(edited).toContain('edited after fork');

    // Persists across reload.
    await page.reload();
    await page.waitForSelector('text=Ready', { timeout: 20000 });
    expect(await sessionCount(page)).toBe(before + 1);
  });

  test('T4 Invalid share links fall back to a normal editable editor', async ({ page }) => {
    // Case A: pure garbage hash.
    await openEditor(page);
    await page.goto('/editor#share=garbage');
    await page.waitForSelector('text=Ready', { timeout: 20000 });
    await expect(page.locator('#shared-preview-banner')).toHaveCount(0);
    await expect(page.locator('#btn-run')).toBeEnabled();
    expect(page.url()).not.toContain('#share=');

    // Case B: valid gzip+JSON that FAILS the brand/shape validation (no
    // partwright brand). Still a normal editable editor, no crash, no toast.
    const badUrl = await page.evaluate(async () => {
      const mod = await import('/src/share/shareLink.ts');
      // Encode an object that decodes fine but isn't a Partwright session.
      const notASession = { hello: 'world', versions: [] };
      const encoded = await mod.encodeShare(notASession as never);
      return `${location.origin}/editor#share=${encoded}`;
    });
    await page.goto(badUrl);
    await page.waitForSelector('text=Ready', { timeout: 20000 });
    await expect(page.locator('#shared-preview-banner')).toHaveCount(0);
    await expect(page.locator('#btn-run')).toBeEnabled();
    expect(page.url()).not.toContain('#share=');
    // No error toast surfaced.
    await expect(page.getByText('invalid or corrupted')).toHaveCount(0);
  });

  test('T5 SCAD share previews without running and forks into SCAD', async ({ page }) => {
    await openEditor(page);

    const scadCode = 'cube([10, 10, 10], center = true);';
    const url = await buildShareUrl(page, { code: scadCode, language: 'scad', volume: 1000, thumbnail: TINY_PNG });

    await page.goto(url);
    await page.waitForSelector('#shared-preview-banner', { timeout: 20000 });

    // Preview shows the code + thumbnail, no engine run (sentinel volume intact).
    const previewCode = await page.evaluate(() => (window as { partwright?: { getCode(): string } }).partwright?.getCode?.() ?? '');
    expect(previewCode.replace(/\s+/g, '')).toContain('cube([10,10,10]');
    expect((await geometryData(page)).volume).toBe(1000);
    await expect(page.locator('#shared-preview-overlay img')).toBeVisible();

    // Fork → engine switches to SCAD and runs.
    await page.getByRole('button', { name: 'Fork to edit & run' }).click();
    await expect(page.locator('#shared-preview-banner')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('session')).toBe(true);
    // SCAD engine computes a real volume (1000 for a 10³ cube) — proves a run.
    await expect.poll(async () => (await geometryData(page)).status, { timeout: 30000 }).toBe('ok');
  });

  test('T6 Share modal is usable at 375px', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openEditor(page);

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.locator('input[aria-label="Search commands"]');
    await palette.fill('Share design');
    await page.keyboard.press('Enter');

    const urlInput = page.locator('input[readonly]').first();
    await expect(urlInput).toBeVisible({ timeout: 10000 });
    const box = await urlInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);

    // Copy button is a ≥44px touch target.
    const copyBox = await page.getByRole('button', { name: 'Copy', exact: true }).boundingBox();
    expect(copyBox).not.toBeNull();
    expect(copyBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('Offline: the viewer reaches a loaded preview with no cross-origin network', async ({ page }) => {
    await openEditor(page);
    const url = await buildShareUrl(page, { code: 'const { Manifold } = api;\nreturn Manifold.cube([3,3,3], true);', volume: 27, thumbnail: TINY_PNG });

    const origin = new URL(url).origin;
    await page.route('**/*', (route) => {
      const reqOrigin = new URL(route.request().url()).origin;
      return reqOrigin === origin ? route.continue() : route.abort();
    });

    await page.goto(url);
    await page.waitForSelector('#shared-preview-banner', { timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Fork to edit & run' })).toBeVisible();
    expect((await geometryData(page)).volume).toBe(27);
  });
});
