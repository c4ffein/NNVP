import { test, expect } from '@playwright/test';

// The dataset fetch target (https://datasets.nnvp.io) is unreachable in this
// environment, so any dataset load is guaranteed to fail. We additionally abort
// those requests up front so the failure is immediate and deterministic instead
// of waiting on a ~25s connection-reset timeout. This still exercises the real
// error path end-to-end (the component's load .catch -> visible error state).
test.describe('Dataset load error handling', () => {
  test('shows a visible error message and Retry button when a dataset fails to load', async ({ page }) => {
    // Make every dataset request fail fast.
    await page.route('https://datasets.nnvp.io/**', route => route.abort());

    await page.goto('/');
    await page.waitForTimeout(50);

    // Open the Training zone from the general menu.
    const trainingMenu = await page.$('#GeneralMenu .menuTitle:has-text("Training")');
    expect(trainingMenu).not.toBeNull();
    await trainingMenu.click();
    await page.waitForTimeout(100);

    // The Dataset panel is the default tab; make sure it is selected.
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab.click();

    // The component auto-loads the default dataset ~3s after mount; wait past it
    // so that our explicit selection below is the load whose error we assert on.
    await page.waitForTimeout(3500);

    // Selecting a dataset triggers a load, which will fail (aborted request).
    await page.selectOption('#dataset-selector-selector', 'FashionMNIST');

    // The error state must become visible after the load fails.
    const errorBox = page.locator('#dataset-load-error');
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).toContainText("Couldn't load FashionMNIST");

    const retryButton = page.locator('#dataset-load-error-retry');
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toHaveText('Retry');

    // The half-loaded loading bar must not be shown alongside the error.
    await expect(page.locator('#data-selector-loading-bar-container')).toHaveCount(0);

    await page.screenshot({ path: '/tmp/g7-dataux.png', fullPage: true });

    // Retry re-attempts the load; since it fails again, the error must return.
    await retryButton.click();
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).toContainText("Couldn't load FashionMNIST");
  });
});
