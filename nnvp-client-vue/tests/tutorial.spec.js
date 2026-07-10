import { test, expect } from './helpers/canvas';

test.describe('Tutorial mode', () => {
  test.beforeEach(async ({ page, canvas }) => {
    await page.goto(canvas.home);
    await page.waitForTimeout(50);
  });

  test('the Tutorial menu lists the tutorials with completion bars', async ({ page }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
    await expect(page.locator('.tutorial-menu-item')).toHaveCount(3);
    await expect(page.locator('.tutorial-menu-progress')).toHaveCount(3);
    // Fresh profile: nothing started yet.
    await expect(page.locator('.tutorial-menu-item-status').first()).toHaveText('Not started');
  });

  test('starts a tutorial from the menu and advances after the first step action', async ({ page }) => {
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
  });

  test('progress is persisted and shown back in the menu', async ({ page }) => {
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
  });

  test('can be exited', async ({ page }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(100);
    await page.click('.tutorial-menu-item:has-text("Build an MNIST CNN")');
    await page.waitForTimeout(100);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-exit');
    await page.waitForTimeout(50);
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
  });

  test('the running tutorial links back to the tutorial menu', async ({ page }) => {
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
  });

  test('the About modal links to the tutorial menu', async ({ page }) => {
    await page.click('text=About');
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-container')).toContainText('Tutorials');
    await page.click('.about-tutorials-button');
    await page.waitForTimeout(300);
    // About closes, the tutorial menu opens.
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page.locator('.tutorial-menu-container')).toBeVisible();
  });
});
