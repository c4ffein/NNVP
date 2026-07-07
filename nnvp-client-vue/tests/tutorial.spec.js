import { test, expect } from '@playwright/test';

test.describe('MNIST Tutorial mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(50);
  });

  test('starts the tutorial and advances after the first step action', async ({ page }) => {
    // Start the tutorial from the top menu.
    await page.click('text=Tutorial');
    await page.waitForTimeout(50);

    // The overlay card should appear on the first step.
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

  test('can be exited', async ({ page }) => {
    await page.click('text=Tutorial');
    await page.waitForTimeout(50);
    await expect(page.locator('.tutorial-card')).toBeVisible();
    await page.click('.tutorial-exit');
    await page.waitForTimeout(50);
    await expect(page.locator('.tutorial-card')).toHaveCount(0);
  });
});
