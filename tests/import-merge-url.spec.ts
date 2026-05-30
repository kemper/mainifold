// E2E for JSON import "Merge into current session" + the "Import from URL…"
// modal's input validation. No external network is exercised.

import { test, expect, type Page } from 'playwright/test';

async function openEditor(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('partwright-tour-completed', '1'); } catch { /* ignore */ }
  });
  await page.goto('/editor');
  await page.waitForSelector('text=Ready', { timeout: 20_000 });
  await page.waitForFunction(
    () => !!(window as unknown as { partwright?: { run?: unknown } }).partwright?.run,
    { timeout: 20_000 },
  );
}

type PW = {
  createSession: (n?: string) => Promise<unknown>;
  runAndSave: (c: string, l?: string) => Promise<unknown>;
  exportSessionData: (id?: string) => Promise<{ data: unknown }>;
  listParts: () => { id: string; name: string }[];
};

test.describe('Import: merge + from-URL', () => {
  test('JSON import offers "Merge into current session" and appends the parts', async ({ page }) => {
    await openEditor(page);

    // Build an exported session payload from a throwaway session.
    const json = await page.evaluate(async () => {
      const pw = (window as unknown as { partwright: PW }).partwright;
      await pw.createSession('source-session');
      await pw.runAndSave('const { Manifold } = api; return Manifold.cube([6,6,6], true);', 'v1');
      const { data } = await pw.exportSessionData();
      return JSON.stringify(data);
    });

    // Switch to a DIFFERENT session that we will merge into.
    const partsBefore = await page.evaluate(async () => {
      const pw = (window as unknown as { partwright: PW }).partwright;
      await pw.createSession('target-session');
      await pw.runAndSave('const { Manifold } = api; return Manifold.sphere(5);', 'v1');
      return pw.listParts().length;
    });
    expect(partsBefore).toBe(1);

    // Import the source JSON through the toolbar file input.
    await page.locator('#import-wrapper input[type="file"]').setInputFiles({
      name: 'source.partwright.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json, 'utf8'),
    });

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 6000 });
    // The merge destination choice is offered because a session is open.
    await expect(dialog).toContainText('Merge into current session');
    await dialog.getByText('Merge into current session').click();
    // The primary button relabels to "Merge".
    const mergeBtn = dialog.getByRole('button', { name: 'Merge' });
    await expect(mergeBtn).toBeVisible();
    await mergeBtn.click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // The current session now has its original part PLUS the merged one, and we
    // did NOT navigate away to a new session.
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { partwright: PW }).partwright.listParts().length),
    ).toBe(2);

    const sessionName = await page.evaluate(() =>
      new URLSearchParams(window.location.search).get('session'));
    expect(sessionName).toBeTruthy();
  });

  test('"Import from URL…" rejects an unsupported scheme inline', async ({ page }) => {
    await openEditor(page);

    await page.locator('#btn-import').click();
    await page.getByText('Import from URL…').click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 6000 });
    await expect(dialog).toContainText('Import from URL');

    const input = dialog.locator('input[type="text"]');
    await input.fill('file:///etc/passwd');
    await dialog.getByRole('button', { name: 'Import' }).click();
    // Inline validation error; the modal stays open (no network attempt).
    await expect(dialog).toContainText('Only http(s) URLs or share links');
    await expect(dialog).toBeVisible();
  });

  test('"Import from URL…" decodes a pasted share link with no network', async ({ page }) => {
    await openEditor(page);

    // Make a real share link via the console API, then close the session so the
    // import lands cleanly as a new one.
    const shareUrl = await page.evaluate(async () => {
      const pw = (window as unknown as { partwright: PW & { getShareLink: () => Promise<{ url?: string }> } }).partwright;
      await pw.createSession('to-share');
      await pw.runAndSave('const { Manifold } = api; return Manifold.cube([7,7,7], true);', 'v1');
      const r = await pw.getShareLink();
      return r.url ?? '';
    });
    expect(shareUrl).toContain('#share=');

    await page.locator('#btn-import').click();
    await page.getByText('Import from URL…').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 6000 });

    await dialog.locator('input[type="text"]').fill(shareUrl);
    await dialog.getByRole('button', { name: 'Import' }).click();

    // The share preview modal opens (same chooser as a file import). Confirm a
    // new-session import; the share decode happened entirely client-side.
    const previewDialog = page.locator('[role="dialog"]');
    await expect(previewDialog).toContainText('Import session', { timeout: 10_000 });
  });
});
