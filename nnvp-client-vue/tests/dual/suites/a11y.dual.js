/**
 * Migrated from tests/a11y.spec.js. Accessibility assertions read the
 * browser's computed accessibility tree, real keyboard focus order and
 * :focus-visible rendering — none of which exist outside a browser — so
 * every test is an e2eOnly mechanical wrap.
 */
import { e2eOnly } from '../define';

e2eOnly(
  'a11y: top menu exposes menubar/menuitem roles with accessible names',
  'Queries the computed accessibility tree via getByRole(menubar/menuitem) with accessible names — the a11y tree is only computed by a real browser.',
  async ({ page, expect }) => {
    await expect(page.getByRole('menubar', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'File' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'View' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'About' })).toBeVisible();
  },
);

e2eOnly(
  'a11y: top menu is openable with the keyboard (Enter)',
  'Drives real keyboard focus and Enter activation on a menu item and asserts focus state plus revealed submenu items via role queries — focus tracking and key event dispatch need a live browser.',
  async ({ page, expect }) => {
    const fileItem = page.getByRole('menuitem', { name: 'File' });
    await fileItem.focus();
    await expect(fileItem).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    // The File submenu items should now be revealed and named.
    await expect(page.getByRole('menuitem', { name: 'New' })).toBeVisible();
    // exact: the File menu now also has "Save to cloud", so match the plain Save item.
    await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeVisible();
  },
);

e2eOnly(
  'a11y: layer catalog exposes a labelled search box and named add buttons',
  'Asserts accessible names of the search box and catalog buttons via role queries against the browser accessibility tree.',
  async ({ page, expect }) => {
    await expect(page.getByRole('searchbox', { name: 'Search layers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Dense layer' })).toBeVisible();
  },
);

e2eOnly(
  'a11y: a layer can be added through keyboard activation of its catalog item',
  'Activates a catalog button purely via keyboard focus + Enter (no mouse) and asserts a node lands on the board — real keyboard event dispatch and focus semantics.',
  async ({ page, canvas, expect }) => {
    const before = await canvas.layerCount(page);
    const denseButton = page.getByRole('button', { name: 'Add Dense layer' });
    await denseButton.focus();
    await expect(denseButton).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const after = await canvas.layerCount(page);
    expect(after).toBe(before + 1);
  },
);

e2eOnly(
  'a11y: assistant toggle button has an accessible name and expanded state',
  'Asserts aria-expanded state transitions, the labelled dialog role, and that focus physically moves into the opened panel (document.activeElement) — live a11y tree plus real focus management.',
  async ({ page, expect }) => {
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
  },
);

e2eOnly(
  'a11y: About dialog: role, focus trap, Esc close and focus return',
  'Verifies modal focus management end to end: focus lands on the close button, Tab/Shift+Tab stay trapped inside the dialog, Esc closes and returns focus to the trigger — real focus order only exists in a browser.',
  async ({ page, expect }) => {
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
  },
);

e2eOnly(
  'a11y: captures a screenshot with a visible keyboard focus ring',
  'Renders and captures the :focus-visible keyboard focus ring as a screenshot — CSS focus-visible heuristics and pixel output require a real browser.',
  async ({ page, expect }) => {
    // Land keyboard focus on a catalog "Add layer" button. Moving focus with the
    // keyboard (Tab / Shift+Tab) makes :focus-visible apply so the ring renders.
    const denseButton = page.getByRole('button', { name: 'Add Dense layer' });
    await denseButton.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(denseButton).toBeFocused();
    await page.waitForTimeout(50);
    await page.screenshot({ path: '/tmp/g9-a11y.png', fullPage: false });
  },
);
