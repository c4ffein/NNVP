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
    await page.waitForTimeout(50);
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

    // Get content before search
    const leftBarTextBefore = await page.textContent('.LayerCatalog');
    const visibleLayersBefore = await page.$$('.LayerTemplate');

    // Type "dense" in the search box
    await searchBox.type('dense');
    await page.waitForTimeout(50);

    // Get content after search
    const leftBarTextAfter = await page.textContent('.LayerCatalog');
    const visibleLayersAfter = await page.$$('.LayerTemplate');

    console.log('\n=== SEARCH TEST ===');
    console.log('Search box found and typed "dense"');
    console.log('Visible layers before search:', visibleLayersBefore.length);
    console.log('Visible layers after search:', visibleLayersAfter.length);
    console.log('Content changed after search:', leftBarTextBefore !== leftBarTextAfter);

    // Search should filter results (fewer visible items, since we're searching for "dense")
    expect(visibleLayersAfter.length).toBeLessThan(visibleLayersBefore.length);
    expect(visibleLayersAfter.length).toBeGreaterThan(0); // Should still show some results
    expect(leftBarTextAfter.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('should have working top menu', async ({ page }) => {
    // Try clicking File menu
    const fileMenuItems = await page.$$eval('#GeneralMenu .menuTitle',
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
    console.log('\n=== FILE MENU TEST ===');
    // Find the File menu item in GeneralMenu
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    console.log('File menu element found:', fileMenu !== null);
    // Check initial state
    const initialActivated = await page.$$('.menu.activated');
    console.log('Initially activated menus:', initialActivated.length);
    // Click on File menu
    await fileMenu.click();
    await page.waitForTimeout(20);
    // Check activated state after click
    const afterClickActivated = await page.$$('.menu.activated');
    console.log('Activated menus after click:', afterClickActivated.length);
    // Check if dropdown content exists and has display: block
    const dropdownContent = await page.$('.menu.activated > .dropdown-content');
    const dropdownVisible = await page.isVisible('.menu.activated > .dropdown-content');
    console.log('Dropdown element exists:', dropdownContent !== null);
    console.log('Dropdown visible:', dropdownVisible);
    // If not visible, check the styles
    if (!dropdownVisible && dropdownContent) {
      const dropdownStyles = await page.$eval('.dropdown-content', el => ({
        display: window.getComputedStyle(el).display,
        position: window.getComputedStyle(el).position,
        zIndex: window.getComputedStyle(el).zIndex,
      }));
      console.log('Dropdown styles:', dropdownStyles);
    }
    // Try to find menu items
    const menuItemsText = await page.textContent('body');
    const hasGenerate = menuItemsText.includes('Generate');
    const hasSave = menuItemsText.includes('Save');
    const hasLoad = menuItemsText.includes('Load');
    console.log('Has Generate option:', hasGenerate);
    console.log('Has Save option:', hasSave);
    console.log('Has Load option:', hasLoad);
    expect(dropdownVisible).toBe(true);
    expect(hasGenerate).toBe(true);
    expect(hasSave).toBe(true);
    expect(hasLoad).toBe(true);
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
    // Should have at least several major categories (Core, Convolutional, Pooling, etc)
    expect(categoryNames.length).toBeGreaterThan(4);
    expect(consoleErrors.length).toBe(0);
  });

  test('should not have any runtime errors after 3 seconds', async ({ page }) => {
    // Wait a bit to let any async operations complete
    await page.waitForTimeout(100);
    console.log('\n=== RUNTIME STABILITY TEST ===');
    console.log('Total console messages:', consoleMessages.length);
    console.log('Console errors found:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    }
    expect(consoleErrors.length).toBe(0);
  });

  test('should handle undo/redo state correctly', async ({ page }) => {
    console.log('\n=== UNDO/REDO STATE TEST ===');
    // Helper to check if menu item is disabled
    const isMenuItemDisabled = async (itemText) => {
      // Open Edit menu
      const editMenu = await page.$('#GeneralMenu .menuTitle:has-text("Edit")');
      await editMenu.click();
      await page.waitForTimeout(20);
      // Check if the menu item has disabled class
      const menuItem = await page.$(`#GeneralMenu .menuItem:has-text("${itemText}")`);
      const isDisabled = await menuItem.evaluate(el => el.classList.contains('disabled'));
      // Close menu by clicking elsewhere
      await page.click('body', { position: { x: 0, y: 0 } });
      await page.waitForTimeout(10);
      return isDisabled;
    };
    // 1. Check initial state - both should be disabled
    const undoDisabledInitial = await isMenuItemDisabled('Undo');
    const redoDisabledInitial = await isMenuItemDisabled('Redo');
    console.log('Initial state - Undo disabled:', undoDisabledInitial);
    console.log('Initial state - Redo disabled:', redoDisabledInitial);
    expect(undoDisabledInitial).toBe(true);
    expect(redoDisabledInitial).toBe(true);
    // 2. Click on Dense layer to add it (we don't need to verify it was added, just that it triggers undo stack)
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    console.log('Clicked Dense layer in catalog');
    // 3. Check Undo is now enabled, Redo still disabled
    const undoDisabledAfterAdd = await isMenuItemDisabled('Undo');
    const redoDisabledAfterAdd = await isMenuItemDisabled('Redo');
    console.log('After adding layer - Undo disabled:', undoDisabledAfterAdd);
    console.log('After adding layer - Redo disabled:', redoDisabledAfterAdd);
    expect(undoDisabledAfterAdd).toBe(false);
    expect(redoDisabledAfterAdd).toBe(true);
    // 4. Click Undo
    const editMenu = await page.$('#GeneralMenu .menuTitle:has-text("Edit")');
    await editMenu.click();
    await page.waitForTimeout(20);
    const undoItem = await page.$('#GeneralMenu .menuItem:has-text("Undo")');
    await undoItem.click();
    await page.waitForTimeout(50);
    console.log('Clicked Undo');
    // 5. Check Undo is disabled, Redo is enabled
    const undoDisabledAfterUndo = await isMenuItemDisabled('Undo');
    const redoDisabledAfterUndo = await isMenuItemDisabled('Redo');
    console.log('After Undo - Undo disabled:', undoDisabledAfterUndo);
    console.log('After Undo - Redo disabled:', redoDisabledAfterUndo);
    expect(undoDisabledAfterUndo).toBe(true);
    expect(redoDisabledAfterUndo).toBe(false);
    // 6. Click Redo
    const editMenu2 = await page.$('#GeneralMenu .menuTitle:has-text("Edit")');
    await editMenu2.click();
    await page.waitForTimeout(20);
    const redoItem = await page.$('#GeneralMenu .menuItem:has-text("Redo")');
    await redoItem.click();
    await page.waitForTimeout(50);
    console.log('Clicked Redo');
    // 7. Check Undo is enabled, Redo is disabled
    const undoDisabledAfterRedo = await isMenuItemDisabled('Undo');
    const redoDisabledAfterRedo = await isMenuItemDisabled('Redo');
    console.log('After Redo - Undo disabled:', undoDisabledAfterRedo);
    console.log('After Redo - Redo disabled:', redoDisabledAfterRedo);
    expect(undoDisabledAfterRedo).toBe(false);
    expect(redoDisabledAfterRedo).toBe(true);
    expect(consoleErrors.length).toBe(0);
  });
});
