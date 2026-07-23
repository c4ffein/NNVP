/**
 * Migrated from tests/tutorial.spec.js. Tutorial mode is coachmark/overlay
 * chrome layered over the app — menus, cards, highlight rings, persistence
 * read back through the menu UI — so every test is an e2eOnly mechanical wrap.
 */
import { e2eOnly } from '../harness/define';

e2eOnly(
  'tutorial: the Tutorial menu lists the tutorials with completion bars',
  'Asserts the tutorial menu modal UI: rendered item and progress-bar element counts plus status text, via auto-retrying DOM matchers on the live page.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
    await expect(page.locator('.tutorial-menu-item')).toHaveCount(3);
    await expect(page.locator('.tutorial-menu-progress')).toHaveCount(3);
    // Fresh profile: nothing started yet.
    await expect(page.locator('.tutorial-menu-item-status').first()).toHaveText('Not started');
  },
);

e2eOnly(
  'tutorial: starts a tutorial from the menu and advances after the first step action',
  'Runs the tutorial overlay as UI: card visibility, the coachmark highlight ring positioned over the catalog, a deliverable page.screenshot, and auto-advance after a real catalog click.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Build an MNIST CNN")');
    await page.waitForTimeout(100);

    // The menu closes and the overlay card appears on the first step.
    await expect(page.locator('.tutorial-menu-container')).toHaveCount(0);
    const card = page.locator('.tutorial-card');
    await expect(card).toBeVisible();
    await expect(page.locator('.tutorial-progress')).toHaveText('Step 1 / 8');
    await expect(card).toContainText('Add an Input layer');

    // The coachmark ring highlights the Input layer template.
    await expect(page.locator('.tutorial-highlight')).toBeVisible();

    // Capture the overlay for the deliverable screenshot.
    await page.screenshot({ path: '/tmp/f2-tutorial.png' });

    // Perform the first step's action: add an Input layer from the catalog.
    await page.click('#layer-template-Input');
    await page.waitForTimeout(200);

    // The tutorial should auto-advance to step 2 (set the input shape).
    await expect(page.locator('.tutorial-progress')).toHaveText('Step 2 / 8');
    await expect(card).toContainText('Set the input shape');
  },
);

e2eOnly(
  'tutorial: progress is persisted and shown back in the menu',
  'Exercises tutorial persistence through the real UI loop: perform a step, exit the overlay, reopen the menu and read the rendered completion percentage from the DOM.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Connect layers")');
    await page.waitForTimeout(100);
    // Do the first step (1 of 3), then exit.
    await page.click('#layer-template-Dense');
    await page.waitForTimeout(200);
    await expect(page.locator('.tutorial-progress')).toHaveText('Step 2 / 3');
    await page.click('.tutorial-exit');
    await page.waitForTimeout(100);
    // Reopen the menu: the bar reflects the reached step.
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    const status = page.locator('.tutorial-menu-item:has-text("Connect layers") .tutorial-menu-item-status');
    await expect(status).toHaveText('33%');
  },
);

e2eOnly(
  'tutorial: can be exited',
  'Asserts the overlay card unmounts from the DOM after clicking the exit control — overlay chrome lifecycle in the real UI.',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Build an MNIST CNN")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-exit');
    await page.waitForTimeout(50);
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
  },
);

e2eOnly(
  'tutorial: the running tutorial links back to the tutorial menu',
  'Navigates from the running overlay card back to the menu modal via UI clicks and asserts the DOM handover (card unmounts, menu container appears).',
  async ({ page, expect }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Build an MNIST CNN")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-menu-link');
    await page.waitForTimeout(100);
    // The tutorial closes and the menu takes over.
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
  },
);

e2eOnly(
  'tutorial: the About modal links to the tutorial menu',
  'Drives the About modal UI into the tutorial menu and asserts one modal replaces the other in the rendered DOM (shared .modal-overlay chrome disambiguated by content).',
  async ({ page, expect }) => {
    // About is its own modal, opened by the ? button at the far right of the
    // top bar.
    await page.click('[aria-label="About NNVP"]');
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-container')).toContainText('Tutorials');
    await page.click('.about-tutorials-button');
    await page.waitForTimeout(300);
    // About closes, the tutorial menu opens. (Both use the shared
    // .modal-overlay chrome now, so identify the About modal by its content.)
    await expect(page.locator('.modal-container')).toHaveCount(0);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
  },
);
