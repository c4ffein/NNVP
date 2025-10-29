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
    await page.waitForTimeout(100);
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
    await page.waitForTimeout(100);
    // Check for basic app structure
    const body = await page.textContent('body');
    console.log('\n=== PAGE LOADED ===');
    console.log('Body has content:', body ? 'yes' : 'no');
    // Check all main UI components (TrainingZone is not rendered initially - it only appears when opened)
    const generalMenu = await page.$('#generalMenu');
    const layerCatalog = await page.$('#layerCatalog');
    const layerOptions = await page.$('#layerOptions');
    const whiteBoard = await page.$('#WhiteBoard');
    console.log('\n=== COMPONENT CHECK ===');
    console.log('GeneralMenu rendered:', generalMenu !== null);
    console.log('LayerCatalog rendered:', layerCatalog !== null);
    console.log('LayerOptions rendered:', layerOptions !== null);
    console.log('WhiteBoard rendered:', whiteBoard !== null);
    expect(generalMenu).not.toBeNull();
    expect(layerCatalog).not.toBeNull();
    expect(layerOptions).not.toBeNull();
    expect(whiteBoard).not.toBeNull();
    // TrainingZone should NOT be rendered initially (v-if="trainerHeight > 0")
    const trainingZone = await page.$('#trainingZone');
    console.log('TrainingZone rendered on load:', trainingZone !== null);
    expect(trainingZone).toBeNull();
  });

  test('should display layer templates in layer catalog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(100);
    // Check if LayerCatalog has layer templates
    const layerCatalogContent = await page.textContent('#layerCatalog');
    console.log('\n=== LAYER CATALOG CONTENT CHECK ===');
    console.log('LayerCatalog has content:', layerCatalogContent.length > 0);
    // Should have some layer types visible
    expect(layerCatalogContent.length).toBeGreaterThan(0);
  });

  test('should position whiteboard canvas below GeneralMenu and right of LayerCatalog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(100);
    // Get panel positions
    const generalMenu = await page.$('#generalMenu');
    const layerCatalog = await page.$('#layerCatalog');
    const menuBox = await generalMenu.boundingBox();
    const catalogBox = await layerCatalog.boundingBox();
    // Add a layer to test positioning
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    // Get the layer position
    const canvasLayer = await page.$('.d3Layer');
    const layerBox = await canvasLayer.boundingBox();
    console.log('\n=== WHITEBOARD POSITIONING TEST ===');
    console.log('GeneralMenu bottom:', menuBox.y + menuBox.height);
    console.log('LayerCatalog right:', catalogBox.x + catalogBox.width);
    console.log('First layer position:', { x: layerBox.x, y: layerBox.y });
    // Layer should be below GeneralMenu (not overlapping)
    const clearOfMenu = layerBox.y > (menuBox.y + menuBox.height);
    // Layer should be right of LayerCatalog (not overlapping)
    const clearOfCatalog = layerBox.x > (catalogBox.x + catalogBox.width);
    console.log('Layer clear of GeneralMenu:', clearOfMenu);
    console.log('Layer clear of LayerCatalog:', clearOfCatalog);
    // Layers should be positioned in the visible canvas area
    expect(clearOfMenu).toBe(true);
    expect(clearOfCatalog).toBe(true);
  });

  test('should pan the board correctly without resetting to 0,0', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(100);
    console.log('\n=== BOARD PANNING TEST ===');
    // Get initial SVG transform
    const svg = await page.$('#svgWrapper svg');
    const svgBox = await svg.boundingBox();
    const initialTransform = await page.evaluate(() => {
      const svg = document.querySelector('#svgWrapper svg');
      const g = svg.querySelector('g');
      const transform = g.getAttribute('transform');
      console.log('Initial transform:', transform);
      return transform;
    });
    console.log('Initial transform:', initialTransform);
    // Add a layer to have a reference point
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    // Get initial layer position
    const initialLayerPos = await page.evaluate(() => {
      const layer = document.querySelector('.d3Layer');
      const rect = layer.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    console.log('Initial layer position:', initialLayerPos);
    // Perform a pan by dragging on empty space
    // Click and drag from center of SVG to pan it
    const startX = svgBox.x + 400;
    const startY = svgBox.y + 300;
    const endX = startX + 100; // Pan 100px to the right
    const endY = startY + 50;  // Pan 50px down
    console.log(`Panning from (${startX}, ${startY}) to (${endX}, ${endY})`);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(100); // Small delay to ensure drag is recognized
    await page.mouse.move(endX, endY);
    await page.mouse.up();
    await page.waitForTimeout(50);
    // Get final transform and layer position
    const finalTransform = await page.evaluate(() => {
      const svg = document.querySelector('#svgWrapper svg');
      const g = svg.querySelector('g');
      const transform = g.getAttribute('transform');
      console.log('Final transform:', transform);
      return transform;
    });
    const finalLayerPos = await page.evaluate(() => {
      const layer = document.querySelector('.d3Layer');
      const rect = layer.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
    console.log('Final transform:', finalTransform);
    console.log('Final layer position:', finalLayerPos);
    // Calculate how much the layer moved
    const deltaX = finalLayerPos.x - initialLayerPos.x;
    const deltaY = finalLayerPos.y - initialLayerPos.y;
    console.log('Layer moved by:', { deltaX, deltaY });
    // The transform should have changed
    expect(finalTransform).not.toBe(initialTransform);
    // The layer should have moved approximately by the drag amount
    // (within a reasonable tolerance, accounting for any transform calculations)
    expect(Math.abs(deltaX - 100)).toBeLessThan(20); // Within 20px tolerance
    expect(Math.abs(deltaY - 50)).toBeLessThan(20);
    // Most importantly: the layer should still be clear of the panels after panning
    const generalMenu = await page.$('#generalMenu');
    const layerCatalog = await page.$('#layerCatalog');
    const menuBox = await generalMenu.boundingBox();
    const catalogBox = await layerCatalog.boundingBox();
    const clearOfMenu = finalLayerPos.y > (menuBox.y + menuBox.height);
    const clearOfCatalog = finalLayerPos.x > (catalogBox.x + catalogBox.width);
    console.log('After panning - Layer clear of GeneralMenu:', clearOfMenu);
    console.log('After panning - Layer clear of LayerCatalog:', clearOfCatalog);
    expect(clearOfMenu).toBe(true);
    expect(clearOfCatalog).toBe(true);
  });
});
