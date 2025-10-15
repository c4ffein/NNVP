import { test, expect } from '@playwright/test';

test.describe('NNVP App', () => {
  let consoleMessages = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];

    // Capture all console messages
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      consoleMessages.push({ type, text });

      if (type === 'error') {
        consoleErrors.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`PAGE ERROR: ${error.message}`);
    });
  });

  test.afterEach(async () => {
    // Print all console output
    if (consoleMessages.length > 0) {
      console.log('\n=== BROWSER CONSOLE OUTPUT ===');
      consoleMessages.forEach(({ type, text }) => {
        console.log(`[${type.toUpperCase()}] ${text}`);
      });
    }

    // Print errors prominently
    if (consoleErrors.length > 0) {
      console.log('\n=== BROWSER CONSOLE ERRORS ===');
      consoleErrors.forEach(error => {
        console.log(`❌ ${error}`);
      });
    }
  });

  test('should load the app without console errors', async ({ page }) => {
    await page.goto('/');

    // Wait a bit for the app to initialize
    await page.waitForTimeout(2000);

    // Check if there are any errors
    if (consoleErrors.length > 0) {
      console.log(`\n⚠️  Found ${consoleErrors.length} console error(s)`);
    } else {
      console.log('\n✅ No console errors detected');
    }

    // This will fail if there are errors, helping us identify issues
    expect(consoleErrors.length).toBe(0);
  });

  test('should render the main components', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Check for basic app structure
    const body = await page.textContent('body');
    console.log('\n=== PAGE LOADED ===');
    console.log('Body has content:', body ? 'yes' : 'no');

    // Check all main UI components
    const topBar = await page.$('#topBar');
    const leftBar = await page.$('#leftBar');
    const rightBar = await page.$('#rightBar');
    const whiteBoard = await page.$('#whiteBoard');
    const bottomTrainer = await page.$('#bottomTrainer');

    console.log('\n=== COMPONENT CHECK ===');
    console.log('TopBar rendered:', topBar !== null);
    console.log('LeftBar rendered:', leftBar !== null);
    console.log('RightBar rendered:', rightBar !== null);
    console.log('WhiteBoard rendered:', whiteBoard !== null);
    console.log('BottomTrainer rendered:', bottomTrainer !== null);

    expect(topBar).not.toBeNull();
    expect(leftBar).not.toBeNull();
    expect(rightBar).not.toBeNull();
    expect(whiteBoard).not.toBeNull();
    expect(bottomTrainer).not.toBeNull();
  });

  test('should display layer templates in left bar', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Check if LeftBar has layer templates
    const leftBarContent = await page.textContent('#leftBar');
    console.log('\n=== LEFT BAR CONTENT CHECK ===');
    console.log('LeftBar has content:', leftBarContent.length > 0);

    // Should have some layer types visible
    expect(leftBarContent.length).toBeGreaterThan(0);
  });
});
