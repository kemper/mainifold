import { expect, type Page } from 'playwright/test';

/** Ensure the AI panel is open.
 *
 *  The panel now opens by default on a fresh visit, so the old "click #btn-ai
 *  to open it" no longer holds — a single click would *close* it. This helper
 *  is idempotent: it only clicks when the panel is hidden, and retries so it
 *  tolerates the brief window during editor init where `state.open` is already
 *  true but the drawer hasn't been un-hidden yet (a click then would race the
 *  init and toggle it shut). */
export async function openAiPanel(page: Page): Promise<void> {
  await page.waitForSelector('#ai-panel', { state: 'attached' });
  const panel = page.locator('#ai-panel');
  await expect(async () => {
    if (!(await panel.isVisible())) {
      await page.locator('#btn-ai').dispatchEvent('click');
    }
    await expect(panel).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

/** Seed settings so the AI drawer starts CLOSED on load. The drawer auto-hides
 *  the code editor when open (it frees room for the viewport + chat), so
 *  editor-focused tests — ones that type into the CodeMirror DOM or assert on
 *  the editor pane — seed this to keep the editor visible. Race-free: the drawer
 *  never opens, so it never collapses the editor. Call before page.goto(). */
export async function keepAiPanelClosed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('partwright-ai-settings-v1', JSON.stringify({ drawerOpen: false }));
    } catch { /* ignore */ }
  });
}
