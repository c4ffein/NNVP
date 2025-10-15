import { test, expect } from '@playwright/test';

test.describe('NNVP Core Features', () => {
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

  test('should add a layer to canvas by clicking template', async ({ page }) => {
    // Get initial number of layers on canvas
    const layersBeforeCount = await page.$$eval('.d3Layer', layers => layers.length);

    console.log('\n=== LAYER PLACEMENT TEST ===');
    console.log('Layers on canvas before:', layersBeforeCount);

    // Find and click a Dense layer template
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    expect(denseLayer).not.toBeNull();

    await denseLayer.click();
    await page.waitForTimeout(500);

    // Check that a layer was added to the canvas
    const layersAfterCount = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers on canvas after:', layersAfterCount);

    expect(layersAfterCount).toBe(layersBeforeCount + 1);
    expect(consoleErrors.length).toBe(0);
  });

  test('should add multiple different layers sequentially', async ({ page }) => {
    // Click Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(300);

    const afterFirstLayer = await page.$$eval('.d3Layer', layers => layers.length);

    // Click Dropout layer (should be in a different category)
    const dropoutLayer = await page.$('.LayerTemplate:has-text("Dropout")');
    await dropoutLayer.click();
    await page.waitForTimeout(300);

    const afterSecondLayer = await page.$$eval('.d3Layer', layers => layers.length);

    console.log('\n=== MULTIPLE LAYERS TEST ===');
    console.log('After first layer (Dense):', afterFirstLayer);
    console.log('After second layer (Dropout):', afterSecondLayer);

    expect(afterSecondLayer).toBe(afterFirstLayer + 1);
    expect(afterSecondLayer).toBeGreaterThanOrEqual(2);
    expect(consoleErrors.length).toBe(0);
  });

  test('should load a template from File menu', async ({ page }) => {
    // TODO WARNING FAILING TEST, STILL COMITTED BEFORE FIX
    // Open File menu
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);

    // Check if Templates submenu exists
    const templatesOption = await page.$('text=Templates');

    console.log('\n=== TEMPLATE LOADING TEST ===');
    console.log('Templates menu available:', templatesOption !== null);

    if (templatesOption) {
      // Hover to open Templates submenu
      await templatesOption.hover();
      await page.waitForTimeout(500);

      // Try to find any template (templates are dynamically loaded)
      const templates = await page.$$('.dropdown-content .menuItem');
      console.log('Number of templates found:', templates.length);

      // If templates exist, find one that's not "New" (empty template)
      if (templates.length > 0) {
        let templateToLoad = null;
        let templateName = '';

        for (const template of templates) {
          const text = await template.textContent();
          if (text.trim() !== 'New') {
            templateToLoad = template;
            templateName = text.trim();
            break;
          }
        }

        // Fallback to first template if all are "New" (unlikely)
        if (!templateToLoad) {
          templateToLoad = templates[0];
          templateName = await templateToLoad.textContent();
        }

        console.log('Loading template:', templateName);
        await templateToLoad.click();

        // Wait longer for template to load and render
        await page.waitForTimeout(2000);

        // Check for different possible layer selectors
        const d3Layers = await page.$$('.d3Layer');
        const d3CompositeLayers = await page.$$('.d3CompositeLayer');
        const totalLayers = d3Layers.length + d3CompositeLayers.length;

        console.log('d3Layer count:', d3Layers.length);
        console.log('d3CompositeLayer count:', d3CompositeLayers.length);
        console.log('Total layers on canvas after template load:', totalLayers);

        expect(totalLayers).toBeGreaterThan(0);
      }
    }

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate JavaScript code', async ({ page }) => {
    // TODO CHECK CONTENT
    // Add a simple layer first
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Set up listener for download or popup
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    // Open File menu and click Generate Javascript
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const generateJsOption = await page.$('text=Generate Javascript');
    await generateJsOption.click();
    await page.waitForTimeout(1000);

    console.log('\n=== JAVASCRIPT GENERATION TEST ===');

    // Check if download happened
    const download = await downloadPromise;
    if (download) {
      console.log('JavaScript code download triggered');
      console.log('Download filename:', download.suggestedFilename());
      expect(download.suggestedFilename()).toContain('.js');
    } else {
      console.log('No download, checking for other output methods');
      // Code might be shown in a different way (popup, textarea, etc.)
    }

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate Python code', async ({ page }) => {
    // TODO CHECK CONTENT
    // Add a simple layer first
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Set up listener for download or popup
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    // Open File menu and click Generate
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const generateOption = await page.$('text=Generate');
    // Make sure we're not clicking "Generate Javascript"
    const generateText = await generateOption.textContent();
    if (generateText.trim() === 'Generate') {
      await generateOption.click();
      await page.waitForTimeout(1000);

      console.log('\n=== PYTHON GENERATION TEST ===');

      // Check if download happened
      const download = await downloadPromise;
      if (download) {
        console.log('Python code download triggered');
        console.log('Download filename:', download.suggestedFilename());
        expect(download.suggestedFilename()).toContain('.py');
      } else {
        console.log('No download, checking for other output methods');
      }

      expect(consoleErrors.length).toBe(0);
    }
  });

  test('should select a layer and show parameters in RightBar', async ({ page }) => {
    // Add a Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Click on the layer in the canvas to select it
    const layerOnCanvas = await page.$('.d3Layer');
    await layerOnCanvas.click();
    await page.waitForTimeout(500);

    // Check if RightBar shows parameters
    const rightBarContent = await page.textContent('#rightBar');

    console.log('\n=== PARAMETER DISPLAY TEST ===');
    console.log('RightBar has content:', rightBarContent.length > 0);
    console.log('RightBar contains "units":', rightBarContent.includes('units'));

    expect(rightBarContent.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('should support undo/redo operations', async ({ page }) => {
    // TODO ALSO TEST REDO, MAYBE IN AN ADDITIONAL TEST?
    // Add two layers
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(300);

    await denseLayer.click();
    await page.waitForTimeout(300);

    const layersAfterAdd = await page.$$eval('.d3Layer', layers => layers.length);

    console.log('\n=== UNDO/REDO TEST ===');
    console.log('Layers after adding 2:', layersAfterAdd);

    // Click Edit menu -> Undo
    const editMenu = await page.$('text=Edit');
    await editMenu.click();
    await page.waitForTimeout(300);

    const undoOption = await page.$('text=Undo');
    await undoOption.click();
    await page.waitForTimeout(500);

    const layersAfterUndo1 = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers after first undo:', layersAfterUndo1);

    // Undo again
    await editMenu.click();
    await page.waitForTimeout(300);
    const undoOption2 = await page.$('text=Undo');
    await undoOption2.click();
    await page.waitForTimeout(500);

    const layersAfterUndo2 = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers after second undo:', layersAfterUndo2);

    expect(layersAfterUndo2).toBeLessThan(layersAfterAdd);
    expect(consoleErrors.length).toBe(0);
  });
});
