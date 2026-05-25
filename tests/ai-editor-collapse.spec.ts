// The AI drawer and the code editor share horizontal room. Opening the drawer
// auto-hides the editor (the AI is doing the coding, so the pane isn't needed by
// default); closing it brings the editor back. The user can still reveal the
// editor manually with Show code, and that choice is respected when the drawer
// is later closed.
//
// Visibility is asserted on #editor-container (the editor pane wrapper, which
// has overflow-hidden and collapses to zero width) rather than .cm-content —
// CodeMirror's inner content keeps its intrinsic width even when the pane is
// clipped, so it reads as "visible" to Playwright.

import { test, expect } from 'playwright/test';

async function openEditor(page: import('playwright/test').Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('partwright-tour-completed', '1'); } catch { /* ignore */ }
  });
  await page.goto('/editor');
  // Wait for full editor init so the AI drawer has mounted and run its
  // default-open, which is what auto-hides the editor.
  await page.waitForFunction(() => !!(window as unknown as { partwright?: { help?: unknown } }).partwright?.help);
}

test.describe('AI panel / code editor coupling', () => {
  test('drawer open by default hides the editor; Show code reveals it', async ({ page }) => {
    await openEditor(page);

    // Drawer is open by default, so the editor starts hidden behind it.
    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeHidden();
    const showCode = page.locator('button', { hasText: 'Show code' });
    await expect(showCode).toBeVisible();

    // Revealing the editor manually keeps the drawer open.
    await showCode.click();
    await expect(page.locator('#editor-container')).toBeVisible();
    await expect(page.locator('#ai-panel')).toBeVisible();

    // A manual reveal takes ownership: closing the drawer leaves the editor up.
    await page.click('#ai-panel button:has-text("✕")');
    await expect(page.locator('#ai-panel')).toBeHidden();
    await expect(page.locator('#editor-container')).toBeVisible();
  });

  test('closing the auto-hidden editor restores it; reopening hides it again', async ({ page }) => {
    await openEditor(page);

    await expect(page.locator('#editor-container')).toBeHidden();

    // Closing the drawer restores the editor we auto-hid.
    await page.click('#ai-panel button:has-text("✕")');
    await expect(page.locator('#ai-panel')).toBeHidden();
    await expect(page.locator('#editor-container')).toBeVisible();

    // Reopening the drawer hides the editor again.
    await page.click('#btn-ai');
    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeHidden();
  });

  test('first-run tour keeps the editor visible (auto-hide waits for tour completion)', async ({ page }) => {
    // A brand-new visitor: no tour-completed flag (a fresh context has none).
    // The drawer still opens by default, but the editor must stay up so the
    // tour's opening step — which spotlights the editor pane — has a target.
    await page.goto('/editor');
    await page.waitForFunction(() => !!(window as unknown as { partwright?: { help?: unknown } }).partwright?.help);

    await expect(page.locator('#ai-panel')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeVisible();
  });
});
