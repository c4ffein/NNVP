import { test, expect } from '@playwright/test';

// Accessibility pass over the core UI chrome (menus, catalog, panels, dialogs).
// Uses Playwright's native role/name queries rather than any heavy a11y dep.
test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(100);
  });

  test('top menu exposes menubar/menuitem roles with accessible names', async ({ page }) => {
    await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'File' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Training' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'About' })).toBeVisible();
  });

  test('top menu is openable with the keyboard (Enter)', async ({ page }) => {
    const fileItem = page.getByRole('menuitem', { name: 'File' });
    await fileItem.focus();
    await expect(fileItem).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    // The File submenu items should now be revealed and named.
    await expect(page.getByRole('menuitem', { name: 'New' })).toBeVisible();
    // exact: the File menu now also has "Save to cloud", so match the plain Save item.
    await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeVisible();
  });

  test('layer catalog exposes a labelled search box and named add buttons', async ({ page }) => {
    await expect(page.getByRole('searchbox', { name: 'Search layers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Dense layer' })).toBeVisible();
  });

  test('a layer can be added through keyboard activation of its catalog item', async ({ page }) => {
    const before = await page.$$eval('.d3Layer', els => els.length);
    const denseButton = page.getByRole('button', { name: 'Add Dense layer' });
    await denseButton.focus();
    await expect(denseButton).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const after = await page.$$eval('.d3Layer', els => els.length);
    expect(after).toBe(before + 1);
  });

  test('assistant toggle button has an accessible name and expanded state', async ({ page }) => {
    const fab = page.getByRole('button', { name: 'Toggle assistant' });
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true');
    // The panel is a labelled dialog and the message field has an accessible name.
    const panel = page.getByRole('dialog', { name: 'Assistant' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message the assistant' })).toBeVisible();
    // Opening the panel moves focus into it.
    expect(await panel.evaluate(el => el.contains(document.activeElement))).toBe(true);
  });

  test('About dialog: role, focus trap, Esc close and focus return', async ({ page }) => {
    const aboutItem = page.getByRole('menuitem', { name: 'About' });
    await aboutItem.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'NNVP' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Focus is moved into the dialog (onto the close button).
    const closeButton = dialog.getByRole('button', { name: 'Close' });
    await expect(closeButton).toBeFocused();

    // Focus trap: Tab keeps focus inside the dialog and wraps around.
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);

    // Esc closes the dialog and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(aboutItem).toBeFocused();
  });

  test('captures a screenshot with a visible keyboard focus ring', async ({ page }) => {
    // Land keyboard focus on a catalog "Add layer" button. Moving focus with the
    // keyboard (Tab / Shift+Tab) makes :focus-visible apply so the ring renders.
    const denseButton = page.getByRole('button', { name: 'Add Dense layer' });
    await denseButton.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(denseButton).toBeFocused();
    await page.waitForTimeout(50);
    await page.screenshot({ path: '/tmp/g9-a11y.png', fullPage: false });
  });
});
