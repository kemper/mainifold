// Autocomplete for the manifold-js sandbox API. Drives the real CodeMirror
// completion tooltip. The first-run tour is pre-dismissed so its backdrop
// doesn't intercept the click into the editor.

import { test, expect } from 'playwright/test';
import { keepAiPanelClosed } from './helpers/aiPanel';

async function openEditor(page: import('playwright/test').Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('partwright-tour-completed', new Date().toISOString()); } catch { /* ignore */ }
  });
  // Keep the AI drawer closed so the code editor stays visible (the drawer
  // auto-hides it). This suite drives the CodeMirror DOM directly.
  await keepAiPanelClosed(page);
  await page.goto('/editor');
  await page.waitForSelector('text=Ready', { timeout: 15000 });
}

async function replaceEditorWith(page: import('playwright/test').Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text, { delay: 15 });
}

test.describe('editor autocomplete', () => {
  test('Manifold. suggests static constructors', async ({ page }) => {
    await openEditor(page);
    await replaceEditorWith(page, 'Manifold.c');
    const tooltip = page.locator('.cm-tooltip-autocomplete');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('cube');
    await expect(tooltip).toContainText('cylinder');
    // A CrossSection-only / instance method should NOT be in the static list.
    await expect(tooltip).not.toContainText('offset');
  });

  test('accepting a completion inserts call parentheses', async ({ page }) => {
    await openEditor(page);
    await replaceEditorWith(page, 'Manifold.sph');
    const tooltip = page.locator('.cm-tooltip-autocomplete');
    await expect(tooltip).toBeVisible();
    await tooltip.locator('[role="option"]').filter({ hasText: 'sphere' }).click();
    await expect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .poll(() => page.evaluate(() => (window as any).partwright.getCode()))
      .toContain('Manifold.sphere(');
  });

  test('api. suggests injected sandbox members', async ({ page }) => {
    await openEditor(page);
    await replaceEditorWith(page, 'api.i');
    const tooltip = page.locator('.cm-tooltip-autocomplete');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('imports');
  });
});
