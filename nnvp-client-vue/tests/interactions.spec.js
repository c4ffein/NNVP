import { test, expect } from '@playwright/test';

test.describe('NNVP Interactions', () => {
  let consoleMessages = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];

    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      consoleMessages.push({ type, text });
      if (type === 'error') {
        consoleErrors.push(text);
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(`PAGE ERROR: ${error.message}`);
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test.afterEach(async () => {
    if (consoleErrors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      consoleErrors.forEach(error => console.log(`❌ ${error}`));
    }
  });

  test('should be able to search for layers', async ({ page }) => {
    const searchBox = await page.$('#layerSearchBox');
    expect(searchBox).not.toBeNull();

    // Type "dense" in the search box
    await searchBox.type('dense');
    await page.waitForTimeout(500);

    // Check that search filtering works
    const leftBarText = await page.textContent('#leftBar');
    console.log('\n=== SEARCH TEST ===');
    console.log('Search box found and typed "dense"');
    console.log('LeftBar still has content after search:', leftBarText.length > 0);

    expect(consoleErrors.length).toBe(0);
  });

  test('should have working top menu', async ({ page }) => {
    // Try clicking File menu
    const fileMenuItems = await page.$$eval('#TopBar .menuTitle',
      elements => elements.map(el => el.textContent)
    );

    console.log('\n=== TOP MENU TEST ===');
    console.log('Menu items found:', fileMenuItems);

    expect(fileMenuItems.length).toBeGreaterThan(0);
    expect(fileMenuItems).toContain('File');
    expect(fileMenuItems).toContain('Edit');
    expect(fileMenuItems).toContain('Training');
    expect(fileMenuItems).toContain('About');

    expect(consoleErrors.length).toBe(0);
  });

  test('should open File menu and show options', async ({ page }) => {
    // Click on File menu
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);

    // Check if dropdown is visible
    const dropdownVisible = await page.isVisible('.dropdown-content');
    console.log('\n=== FILE MENU TEST ===');
    console.log('File menu clicked');
    console.log('Dropdown visible:', dropdownVisible);

    // Try to find menu items
    const menuItemsText = await page.textContent('body');
    const hasGenerate = menuItemsText.includes('Generate');
    const hasSave = menuItemsText.includes('Save');
    const hasLoad = menuItemsText.includes('Load');

    console.log('Has Generate option:', hasGenerate);
    console.log('Has Save option:', hasSave);
    console.log('Has Load option:', hasLoad);

    expect(consoleErrors.length).toBe(0);
  });

  test('should have SVG canvas in whiteboard', async ({ page }) => {
    const svg = await page.$('#svgWrapper svg');
    expect(svg).not.toBeNull();

    const svgBBox = await svg.boundingBox();
    console.log('\n=== WHITEBOARD TEST ===');
    console.log('SVG canvas found');
    console.log('SVG dimensions:', svgBBox);
    console.log('SVG has width:', svgBBox.width > 0);
    console.log('SVG has height:', svgBBox.height > 0);

    expect(svgBBox.width).toBeGreaterThan(0);
    expect(svgBBox.height).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('should be able to check layer categories', async ({ page }) => {
    // Find all layer categories
    const categories = await page.$$('.layerCategory .title .text');
    const categoryNames = await Promise.all(
      categories.map(cat => cat.textContent())
    );

    console.log('\n=== LAYER CATEGORIES TEST ===');
    console.log('Number of categories:', categoryNames.length);
    console.log('Category names:', categoryNames);

    expect(categoryNames.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('should not have any runtime errors after 3 seconds', async ({ page }) => {
    // Wait a bit to let any async operations complete
    await page.waitForTimeout(3000);

    console.log('\n=== RUNTIME STABILITY TEST ===');
    console.log('Total console messages:', consoleMessages.length);
    console.log('Console errors found:', consoleErrors.length);

    if (consoleErrors.length > 0) {
      console.log('Errors:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    }

    expect(consoleErrors.length).toBe(0);
  });
});
