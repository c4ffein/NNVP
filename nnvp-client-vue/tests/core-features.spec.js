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
    expect(download).not.toBeNull();

    console.log('JavaScript code download triggered');
    console.log('Download filename:', download.suggestedFilename());
    expect(download.suggestedFilename()).toContain('.js');

    // Check content
    const path = await download.path();
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Code contains "Dense":', content.includes('Dense') || content.includes('dense'));
    console.log('Code contains "tf.":', content.includes('tf.'));

    expect(content.length).toBeGreaterThan(0);
    expect(content.includes('Dense') || content.includes('dense')).toBe(true);

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate Python code', async ({ page }) => {
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
    expect(generateText.trim()).toBe('Generate');

    await generateOption.click();
    await page.waitForTimeout(1000);

    console.log('\n=== PYTHON GENERATION TEST ===');

    // Check if download happened
    const download = await downloadPromise;
    expect(download).not.toBeNull();

    console.log('Python code download triggered');
    console.log('Download filename:', download.suggestedFilename());
    expect(download.suggestedFilename()).toContain('.py');

    // Check content
    const path = await download.path();
    const fs = require('fs');
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Code contains "Dense":', content.includes('Dense'));
    console.log('Code contains "keras" or "tensorflow":', content.includes('keras') || content.includes('tensorflow'));

    expect(content.length).toBeGreaterThan(0);
    expect(content.includes('Dense')).toBe(true);

    expect(consoleErrors.length).toBe(0);
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
    const rightbarBlock = await page.$('#rightbar-block');
    const isLayerSelected = await layerOnCanvas.evaluate(el => el.classList.contains('selected'));

    console.log('\n=== PARAMETER DISPLAY TEST ===');
    console.log('Layer is selected:', isLayerSelected);
    console.log('RightBar has content:', rightBarContent.length > 0);
    console.log('RightBar text (first 100 chars):', rightBarContent.substring(0, 100));
    console.log('rightbar-block exists:', rightbarBlock !== null);
    console.log('RightBar contains "units":', rightBarContent.includes('units'));
    console.log('RightBar contains "No layers selected":', rightBarContent.includes('No layers selected'));

    expect(rightBarContent.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  });

  test('should support undo operations', async ({ page }) => {
    // Add two layers
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(300);

    await denseLayer.click();
    await page.waitForTimeout(300);

    const layersAfterAdd = await page.$$eval('.d3Layer', layers => layers.length);

    console.log('\n=== UNDO TEST ===');
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

  test('should modify int parameter and verify in generated code', async ({ page }) => {
    // Add a Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Click layer to select it
    const layerOnCanvas = await page.$('.d3Layer');
    await layerOnCanvas.click();
    await page.waitForTimeout(1000); // Wait longer for reactive update

    // Check if rightbar-block is visible
    const rightbarBlock = await page.$('#rightbar-block');

    console.log('\n=== INT PARAMETER MODIFICATION TEST ===');
    console.log('Rightbar block visible:', rightbarBlock !== null);

    // rightbar-block MUST exist when a layer is selected
    expect(rightbarBlock).not.toBeNull();

    // Find and modify an int parameter
    const numberInputs = await page.$$('#rightbar-block input[type="number"]');
    console.log('Number inputs found:', numberInputs.length);

    // There MUST be number inputs for a Dense layer
    expect(numberInputs.length).toBeGreaterThan(0);

    // Change first parameter to 128
    await numberInputs[0].fill('128');
    await numberInputs[0].dispatchEvent('change');
    await page.waitForTimeout(500);

    console.log('Modified parameter to 128');

    // Generate Python code and check content
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const generateOption = await page.$('text=Generate');
    const generateText = await generateOption.textContent();
    if (generateText.trim() === 'Generate') {
      await generateOption.click();
      await page.waitForTimeout(1000);

      const download = await downloadPromise;
      if (download) {
        const path = await download.path();
        const fs = require('fs');
        const content = fs.readFileSync(path, 'utf-8');

        console.log('Code contains "128":', content.includes('128'));
        expect(content.includes('128')).toBe(true);
      }
    }

    expect(consoleErrors.length).toBe(0);
  });

  test('should modify boolean parameter by clicking', async ({ page }) => {
    // Add a Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Click layer to select it
    const layerOnCanvas = await page.$('.d3Layer');
    await layerOnCanvas.click();
    await page.waitForTimeout(1000); // Wait longer for reactive update

    // Check if rightbar-block is visible
    const rightbarBlock = await page.$('#rightbar-block');

    console.log('\n=== BOOLEAN PARAMETER MODIFICATION TEST ===');
    console.log('Rightbar block visible:', rightbarBlock !== null);

    // rightbar-block MUST exist when a layer is selected
    expect(rightbarBlock).not.toBeNull();

    // Find boolean parameter selects
    const booleanSelects = await page.$$('#rightbar-block select.parameter-boolean');
    console.log('Boolean parameters found:', booleanSelects.length);

    // Dense layer MUST have boolean parameters
    expect(booleanSelects.length).toBeGreaterThan(0);

    const initialValue = await booleanSelects[0].evaluate(el => el.value);
    console.log('Initial value:', initialValue);

    // Click to toggle
    await booleanSelects[0].click();
    await page.waitForTimeout(500);

    const newValue = await booleanSelects[0].evaluate(el => el.value);
    console.log('Value after click:', newValue);

    expect(newValue).not.toBe('void');

    expect(consoleErrors.length).toBe(0);
  });

  test('should delete a layer using Delete key', async ({ page }) => {
    // Add a layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    const layersBeforeDelete = await page.$$eval('.d3Layer', layers => layers.length);

    // Click on the layer using force to bypass the text element
    const d3LayerElement = await page.$('.d3Layer');
    const box = await d3LayerElement.boundingBox();

    // Click in the center of the layer
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    // Check if layer is selected (has 'selected' class)
    const isSelected = await d3LayerElement.evaluate(el => el.classList.contains('selected'));

    console.log('\n=== LAYER DELETION TEST ===');
    console.log('Layers before delete:', layersBeforeDelete);
    console.log('Layer is selected:', isSelected);

    // Try Backspace first (as per KeyboardListener.js)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    let layersAfterDelete = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers after Backspace:', layersAfterDelete);

    // If Backspace didn't work, try Delete
    // TODO Actually 2 separate tests for delete and backspace
    if (layersAfterDelete === layersBeforeDelete) {
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
      layersAfterDelete = await page.$$eval('.d3Layer', layers => layers.length);
      console.log('Layers after Delete:', layersAfterDelete);
    }

    expect(layersAfterDelete).toBeLessThan(layersBeforeDelete);
    expect(consoleErrors.length).toBe(0);
  });

  test('should test REDO functionality', async ({ page }) => {
    // Add a layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    const layersAfterAdd = await page.$$eval('.d3Layer', layers => layers.length);

    console.log('\n=== REDO TEST ===');
    console.log('Layers after adding:', layersAfterAdd);

    // Undo
    const editMenu = await page.$('text=Edit');
    await editMenu.click();
    await page.waitForTimeout(300);

    const undoOption = await page.$('text=Undo');
    await undoOption.click();
    await page.waitForTimeout(500);

    const layersAfterUndo = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers after undo:', layersAfterUndo);

    // Redo
    await editMenu.click();
    await page.waitForTimeout(300);

    const redoOption = await page.$('text=Redo');
    await redoOption.click();
    await page.waitForTimeout(500);

    const layersAfterRedo = await page.$$eval('.d3Layer', layers => layers.length);
    console.log('Layers after redo:', layersAfterRedo);

    expect(layersAfterRedo).toBe(layersAfterAdd);
    expect(consoleErrors.length).toBe(0);
  });
});
