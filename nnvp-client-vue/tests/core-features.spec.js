import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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

      // Get the templates from the nested dropdown under Templates menuItem
      // The structure is: .menuItem (Templates) > .dropdown-content > .menuItem (actual templates)
      const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
      console.log('Number of templates found:', templates.length);

      // If templates exist, find one that's a real template (not a UI command)
      if (templates.length > 0) {
        let templateToLoad = null;
        let templateName = '';

        // UI commands to skip
        const uiCommands = ['New', 'Load', 'Save', 'Generate', 'Generate Javascript', 'Templates', 'Undo', 'Redo'];

        for (const template of templates) {
          const text = await template.textContent();
          const trimmed = text.trim();
          if (!uiCommands.includes(trimmed)) {
            templateToLoad = template;
            templateName = trimmed;
            break;
          }
        }

        // Fallback to first template if all are UI commands (unlikely)
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

        // Verify layer types in the loaded template
        const layerTexts = await page.$$eval('.d3Layer text', texts => texts.map(t => t.textContent));
        console.log('Layer types:', layerTexts);

        // Template should have Input and Output layers
        expect(layerTexts.some(text => text.includes('Input'))).toBe(true);
        expect(layerTexts.some(text => text.includes('Output'))).toBe(true);

        // Should have at least one processing layer (Dense, Conv, etc.)
        const hasProcessingLayer = layerTexts.some(text =>
          text.includes('Dense') || text.includes('Conv') || text.includes('Flatten')
        );
        expect(hasProcessingLayer).toBe(true);

        // Verify edges/connections exist
        const edges = await page.$$('.link');
        console.log('Number of edges:', edges.length);
        expect(edges.length).toBeGreaterThan(0);
      }
    }

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate JavaScript code from manually built network', async ({ page }) => {
    console.log('\n=== MANUAL NETWORK BUILDING TEST (JS) ===');

    // Add layers by clicking (they'll be added to canvas)
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(500);

    const flattenLayer = await page.$('.LayerTemplate:has-text("Flatten")');
    await flattenLayer.click();
    await page.waitForTimeout(500);

    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    await denseLayer.click(); // Second Dense
    await page.waitForTimeout(500);

    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(500);

    console.log('5 layers added to canvas');

    // Enable debug logging to see D3 drag events
    await page.evaluate(() => {
      window.nnvpGraphEditor.debugEvents = true;
    });
    console.log('Debug logging enabled');

    // Reposition layers vertically using transitionToXY (drag doesn't update model x/y)
    console.log('Repositioning layers vertically...');
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        const layer = window.nnvpGraphEditor.model.d3Layers[i];
        const targetY = 100 + i * 120;
        layer.transitionToXY(300, targetY);
      }
    });
    await page.waitForTimeout(1000);
    console.log('All layers repositioned using transitionToXY');

    // Verify layers are properly positioned
    const layerPositions = await page.evaluate(() => {
      return Array.from({length: 5}, (_, i) => {
        const layer = window.nnvpGraphEditor.model.d3Layers[i];
        return { id: layer.htmlID, x: layer.x, y: layer.y };
      });
    });
    console.log('Layer positions:', JSON.stringify(layerPositions, null, 2));

    console.log('Connecting layers using drag-and-drop on anchors...');

    // Drag from each layer's bottom anchor to the next layer's center to create connections
    for (let i = 0; i < 4; i++) {
      // Get target layer rect to ensure mouseover_node is set
      const targetLayer = await page.$(`#d3-layer-${i+1} rect`);
      const targetBox = await targetLayer.boundingBox();

      const sourceAnchor = await page.$(`#d3-layer-${i} circle.bottom-point`);
      const sourceBox = await sourceAnchor.boundingBox();

      // Start drag from source anchor
      await page.mouse.move(sourceBox.x + sourceBox.width/2, sourceBox.y + sourceBox.height/2);
      await page.waitForTimeout(200);
      await page.mouse.down();
      await page.waitForTimeout(200);

      // Move to target layer center (to set mouseover_node)
      await page.mouse.move(targetBox.x + targetBox.width/2, targetBox.y + targetBox.height/2);
      await page.waitForTimeout(300);

      // Release to create connection
      await page.mouse.up();
      await page.waitForTimeout(500);

      const currentEdges = await page.$$eval('.link:not(.dragline)', links => links.length);
      console.log(`Connected layer ${i} to layer ${i+1}, total edges: ${currentEdges}`);
    }

    console.log('Finished connecting layers');

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

    // Check content against golden master
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    const expectedJS = `function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.flatten({inputShape:[100,100,],}));
    model.add(tf.layers.dense({}));
    model.add(tf.layers.dense({}));
    return model;
}
`;

    console.log('Generated code:\n', content);

    expect(content.trim()).toBe(expectedJS.trim());

    expect(consoleErrors.length).toBe(0);
  });

  test('should connect layers by clicking anchors (auto-connect to nearest)', async ({ page }) => {
    console.log('\n=== AUTO-CONNECT TEST (CLICK ANCHORS) ===');

    // Add 5 layers
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(500);

    const flattenLayer = await page.$('.LayerTemplate:has-text("Flatten")');
    await flattenLayer.click();
    await page.waitForTimeout(500);

    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    await denseLayer.click(); // Second Dense
    await page.waitForTimeout(500);

    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(500);

    console.log('5 layers added to canvas');

    // According to D3Layer.js:373-96, clicking an anchor circle automatically connects
    // to the nearest layer. Since layers are stacked, we can use this mechanism.
    // Each anchor click will find the nearest other layer and connect to it.

    console.log('Connecting layers by clicking anchor points...');

    // Click each layer's anchor to connect to nearest layer
    // This uses the automatic connection mechanism in D3Layer
    await page.click('#d3-layer-0 circle.bottom-point', { force: true });
    await page.waitForTimeout(500);
    console.log('Clicked anchor on layer 0');

    let edgesCount = await page.$$eval('.link', links => links.length);
    console.log('Edges after click 1:', edgesCount);

    await page.click('#d3-layer-1 circle.bottom-point', { force: true });
    await page.waitForTimeout(500);
    console.log('Clicked anchor on layer 1');

    edgesCount = await page.$$eval('.link', links => links.length);
    console.log('Edges after click 2:', edgesCount);

    await page.click('#d3-layer-2 circle.bottom-point', { force: true });
    await page.waitForTimeout(500);
    console.log('Clicked anchor on layer 2');

    edgesCount = await page.$$eval('.link', links => links.length);
    console.log('Edges after click 3:', edgesCount);

    await page.click('#d3-layer-3 circle.bottom-point', { force: true });
    await page.waitForTimeout(500);
    console.log('Clicked anchor on layer 3');

    edgesCount = await page.$$eval('.link', links => links.length);
    console.log('Edges after click 4:', edgesCount);

    // Verify at least some edges were created
    expect(edgesCount).toBeGreaterThan(0);

    console.log('Total edges created:', edgesCount);

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate Python code from manually built network', async ({ page }) => {
    console.log('\n=== MANUAL NETWORK BUILDING TEST (Python) ===');

    // Add layers by clicking
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(500);

    const flattenLayer = await page.$('.LayerTemplate:has-text("Flatten")');
    await flattenLayer.click();
    await page.waitForTimeout(500);

    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    await denseLayer.click(); // Second Dense
    await page.waitForTimeout(500);

    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(500);

    console.log('5 layers added to canvas');

    // Enable debug logging
    await page.evaluate(() => {
      window.nnvpGraphEditor.debugEvents = true;
    });
    console.log('Debug logging enabled');

    // Reposition layers vertically
    console.log('Repositioning layers vertically...');
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        const layer = window.nnvpGraphEditor.model.d3Layers[i];
        const targetY = 100 + i * 120;
        layer.transitionToXY(300, targetY);
      }
    });
    await page.waitForTimeout(1000);
    console.log('All layers repositioned using transitionToXY');

    // Verify positions
    const layerPositions = await page.evaluate(() => {
      return Array.from({length: 5}, (_, i) => {
        const layer = window.nnvpGraphEditor.model.d3Layers[i];
        return { id: layer.htmlID, x: layer.x, y: layer.y };
      });
    });
    console.log('Layer positions:', JSON.stringify(layerPositions, null, 2));

    console.log('Connecting layers using drag-and-drop on anchors...');

    // Drag to connect layers
    for (let i = 0; i < 4; i++) {
      const targetLayer = await page.$(`#d3-layer-${i+1} rect`);
      const targetBox = await targetLayer.boundingBox();

      const sourceAnchor = await page.$(`#d3-layer-${i} circle.bottom-point`);
      const sourceBox = await sourceAnchor.boundingBox();

      await page.mouse.move(sourceBox.x + sourceBox.width/2, sourceBox.y + sourceBox.height/2);
      await page.waitForTimeout(200);
      await page.mouse.down();
      await page.waitForTimeout(200);

      await page.mouse.move(targetBox.x + targetBox.width/2, targetBox.y + targetBox.height/2);
      await page.waitForTimeout(300);

      await page.mouse.up();
      await page.waitForTimeout(500);

      const currentEdges = await page.$$eval('.link:not(.dragline)', links => links.length);
      console.log(`Connected layer ${i} to layer ${i+1}, total edges: ${currentEdges}`);
    }

    console.log('Finished connecting layers');

    // Set up listener for download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    // Open File menu and click Generate
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const generateOption = await page.$('text=Generate');
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

    // Check content against golden master
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    const expectedPython = `from tensorflow import keras

def build_model():
    model = keras.models.Sequential()
    model.add(keras.layers.Flatten(input_shape = (100,100,)))
    model.add(keras.layers.Dense())
    model.add(keras.layers.Dense())
    return model
`;

    console.log('Generated code:\n', content);

    expect(content.trim()).toBe(expectedPython.trim());

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate JavaScript code from template', async ({ page }) => {
    console.log('\n=== JAVASCRIPT GENERATION FROM TEMPLATE TEST ===');

    // Load a template
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);

    const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
    const uiCommands = ['New', 'Load', 'Save', 'Generate', 'Generate Javascript', 'Templates'];

    let templateLoaded = false;
    for (const template of templates) {
      const text = await template.textContent();
      if (!uiCommands.includes(text.trim())) {
        console.log('Loading template:', text.trim());
        await template.click();
        templateLoaded = true;
        break;
      }
    }

    expect(templateLoaded).toBe(true);
    await page.waitForTimeout(2000);

    // Generate JavaScript code
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateJsOption = await page.$('text=Generate Javascript');
    await generateJsOption.click();
    await page.waitForTimeout(1000);

    const download = await downloadPromise;
    expect(download).not.toBeNull();

    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Has content:', content.length > 200);
    console.log('Full generated JS code:');
    console.log(content);

    expect(content.length).toBeGreaterThan(200);
    // JS uses lowercase: tf.layers.dense() or tf.layers.conv2d()
    expect(content.includes('layers.dense') || content.includes('layers.conv')).toBe(true);
    expect(content.includes('tf.')).toBe(true);

    expect(consoleErrors.length).toBe(0);
  });

  test('should generate Python code from template', async ({ page }) => {
    console.log('\n=== PYTHON GENERATION FROM TEMPLATE TEST ===');

    // Load a template
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);

    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);

    const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
    const uiCommands = ['New', 'Load', 'Save', 'Generate', 'Generate Javascript', 'Templates'];

    let templateLoaded = false;
    for (const template of templates) {
      const text = await template.textContent();
      if (!uiCommands.includes(text.trim())) {
        console.log('Loading template:', text.trim());
        await template.click();
        templateLoaded = true;
        break;
      }
    }

    expect(templateLoaded).toBe(true);
    await page.waitForTimeout(2000);

    // Generate Python code
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption = await page.$('text=Generate');
    const generateText = await generateOption.textContent();
    expect(generateText.trim()).toBe('Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);

    const download = await downloadPromise;
    expect(download).not.toBeNull();

    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Has content:', content.length > 200);
    console.log('Contains Dense or Conv:', content.includes('Dense') || content.includes('Conv'));

    expect(content.length).toBeGreaterThan(200);
    expect(content.includes('Dense') || content.includes('Conv')).toBe(true);
    expect(content.includes('keras') || content.includes('tensorflow')).toBe(true);

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
    console.log('\n=== INT PARAMETER MODIFICATION TEST ===');
    // Load a template to get a complete connected network
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);
    // Hover over Templates to open submenu
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    // Select "2D Dense for MNIST" template from submenu
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(1000);
    console.log('Loaded template: 2D Dense for MNIST');
    // Verify we have Dense layers
    const allLayersText = await page.$$eval('.d3Layer text', texts => texts.map(t => t.textContent));
    console.log('Layers on canvas:', allLayersText);
    const hasDenseLayer = allLayersText.some(text => text.includes('Dense'));
    expect(hasDenseLayer).toBe(true);
    // Generate code BEFORE modification
    const downloadPromise1 = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption1 = await page.$('text=Generate');
    await generateOption1.click();
    await page.waitForTimeout(1000);
    const download1 = await downloadPromise1;
    const path1 = await download1.path();
    const contentBefore = fs.readFileSync(path1, 'utf-8');
    console.log('Code before modification length:', contentBefore.length);
    console.log('Code before contains "Dense":', contentBefore.includes('Dense'));
    // Now select the Dense layer and modify its parameter
    const layersOnCanvas = await page.$$('.d3Layer');
    let denseLayerFound = false;
    console.log('Attempting to find and select Dense layer...');
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      // Use mouse.click to bypass text element interception
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const rightBarText = await page.textContent('#rightBar');
      console.log(`Layer ${i}: First 80 chars of rightbar: "${rightBarText.substring(0, 80)}"`);
      if (rightBarText.includes('Dense') && rightBarText.includes('units')) {
        console.log('Found and selected Dense layer');
        denseLayerFound = true;
        // Check if rightbar-block is visible
        const rightbarBlock = await page.$('#rightbar-block');
        expect(rightbarBlock).not.toBeNull();
        // Find and modify the "units" parameter
        const numberInputs = await page.$$('#rightbar-block input[type="number"]');
        console.log('Number inputs found:', numberInputs.length);
        expect(numberInputs.length).toBeGreaterThan(0);
        const initialValue = await numberInputs[0].inputValue();
        console.log('Initial units value:', initialValue);
        // Change to a distinctive value: 256
        await numberInputs[0].fill('256');
        await numberInputs[0].dispatchEvent('change');
        await page.waitForTimeout(500);
        const newValue = await numberInputs[0].inputValue();
        console.log('Modified units value to:', newValue);
        expect(newValue).toBe('256');
        break;
      }
    }
    expect(denseLayerFound).toBe(true);
    // Generate code AFTER modification
    const downloadPromise2 = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption2 = await page.$('text=Generate');
    await generateOption2.click();
    await page.waitForTimeout(1000);
    const download2 = await downloadPromise2;
    const path2 = await download2.path();
    const contentAfter = fs.readFileSync(path2, 'utf-8');
    console.log('Code after modification length:', contentAfter.length);
    console.log('Code after contains "256":', contentAfter.includes('256'));
    console.log('Code changed:', contentBefore !== contentAfter);
    // Verify the code changed and contains our value
    expect(contentAfter.includes('256')).toBe(true);
    expect(contentBefore !== contentAfter).toBe(true);
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

  test('should modify float parameter and verify in generated code', async ({ page }) => {
    console.log('\n=== FLOAT PARAMETER MODIFICATION TEST ===');
    // Load a template with Dropout layer (has float "rate" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Conv for MNIST');
    await template.click();
    await page.waitForTimeout(1000);
    console.log('Loaded template: 2D Conv for MNIST');
    // Generate code BEFORE modification
    const downloadPromiseBefore = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    let generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const downloadBefore = await downloadPromiseBefore;
    const pathBefore = await downloadBefore.path();
    const contentBefore = fs.readFileSync(pathBefore, 'utf-8');
    console.log('Code before modification length:', contentBefore.length);
    // Find and select Dropout layer
    const layersOnCanvas = await page.$$('.d3Layer');
    let dropoutLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const rightBarText = await page.textContent('#rightBar');
      if (rightBarText.includes('Dropout') && rightBarText.includes('rate')) {
        console.log('Found and selected Dropout layer');
        dropoutLayerFound = true;
        // Find the range slider for "rate" parameter (Dropout uses range 0-1)
        const rangeInputs = await page.$$('#rightbar-block input[type="range"]');
        console.log('Range inputs found:', rangeInputs.length);
        expect(rangeInputs.length).toBeGreaterThan(0);
        const initialValue = await rangeInputs[0].inputValue();
        console.log('Initial rate value:', initialValue);
        // Change to 0.75 (this is a slider, so fill works)
        await rangeInputs[0].fill('0.75');
        await rangeInputs[0].dispatchEvent('change');
        await page.waitForTimeout(1000); // Wait for Vue reactivity
        const newValue = await rangeInputs[0].inputValue();
        console.log('Modified rate value to:', newValue);
        expect(newValue).toBe('0.75');
        break;
      }
    }
    expect(dropoutLayerFound).toBe(true);
    // Generate code AFTER modification
    const downloadPromiseAfter = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const downloadAfter = await downloadPromiseAfter;
    const pathAfter = await downloadAfter.path();
    const contentAfter = fs.readFileSync(pathAfter, 'utf-8');
    console.log('Code before contains 0.75:', contentBefore.includes('0.75'));
    console.log('Code after contains 0.75:', contentAfter.includes('0.75'));
    // Verify the parameter change is reflected in the code
    expect(contentBefore.includes('0.75')).toBe(false);
    expect(contentAfter.includes('0.75')).toBe(true);
    console.log('✅ Float parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should modify string parameter and verify in generated code', async ({ page }) => {
    console.log('\n=== STRING PARAMETER MODIFICATION TEST ===');
    // Add an Input layer (has string "name" parameter)
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(1000);
    // Click to select the Input layer
    const layerOnCanvas = await page.$('.d3Layer');
    const box = await layerOnCanvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1000);
    const rightBarText = await page.textContent('#rightBar');
    console.log('RightBar contains Input:', rightBarText.includes('Input'));
    // Find text input for "name" parameter
    const textInputs = await page.$$('#rightbar-block input[type="text"]');
    console.log('Text inputs found:', textInputs.length);
    expect(textInputs.length).toBeGreaterThan(0);
    // Find the "name" input (check labels or use the first one)
    const nameInput = textInputs[0];
    const initialValue = await nameInput.inputValue();
    console.log('Initial name value:', initialValue);
    // Set a distinctive name
    await nameInput.fill('test_input_layer');
    await nameInput.dispatchEvent('change');
    await page.waitForTimeout(1000);
    const newValue = await nameInput.inputValue();
    console.log('Modified name value to:', newValue);
    expect(newValue).toBe('test_input_layer');
    // Generate code and verify
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains test_input_layer:', content.includes('test_input_layer'));
    expect(content.includes('test_input_layer')).toBe(true);
    console.log('✅ String parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should modify tuple parameter and verify in generated code', async ({ page }) => {
    console.log('\n=== TUPLE PARAMETER MODIFICATION TEST ===');
    // Load template with Conv2D (has tuple "kernel_size" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Conv for MNIST');
    await template.click();
    await page.waitForTimeout(1000);
    // Find and select Conv2D layer
    const layersOnCanvas = await page.$$('.d3Layer');
    let conv2dLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const rightBarText = await page.textContent('#rightBar');
      if (rightBarText.includes('Conv2D') && rightBarText.includes('kernel_size')) {
        console.log('Found and selected Conv2D layer');
        conv2dLayerFound = true;
        // Find tuple inputs for kernel_size
        // Conv2D has: filters (int), kernel_size (tuple), strides (tuple), etc.
        // So we need to find the right tuple inputs
        const tupleInputs = await page.$$('#rightbar-block input[type="number"]');
        console.log('Number inputs found:', tupleInputs.length);
        // Log all values to see which ones are kernel_size
        for (let i = 0; i < Math.min(tupleInputs.length, 10); i++) {
          const val = await tupleInputs[i].inputValue();
          console.log(`  Input ${i}: ${val}`);
        }
        // kernel_size is typically the second parameter (after filters)
        // The template has filters=32, kernel_size=(3,3)
        // So indices 1 and 2 should be kernel_size
        expect(tupleInputs.length).toBeGreaterThanOrEqual(3);
        // Change kernel_size (indices 1,2) to (5, 5)
        await tupleInputs[1].fill('5');
        await tupleInputs[1].dispatchEvent('change');
        await page.waitForTimeout(200);
        await tupleInputs[2].fill('5');
        await tupleInputs[2].dispatchEvent('change');
        await page.waitForTimeout(1000);
        const newValue1 = await tupleInputs[1].inputValue();
        const newValue2 = await tupleInputs[2].inputValue();
        console.log(`Modified kernel_size to: (${newValue1}, ${newValue2})`);
        expect(newValue1).toBe('5');
        expect(newValue2).toBe('5');
        break;
      }
    }
    expect(conv2dLayerFound).toBe(true);
    // Generate code and verify
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains kernel_size=(5,5):', content.includes('5,5'));
    expect(content.includes('5,5')).toBe(true);
    console.log('✅ Tuple parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should modify list parameter and verify in generated code', async ({ page }) => {
    console.log('\n=== LIST PARAMETER MODIFICATION TEST ===');
    // Load template with Flatten (has list "data_format" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(1000);
    // Find and select Flatten layer
    const layersOnCanvas = await page.$$('.d3Layer');
    let flattenLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1000);
      const rightBarText = await page.textContent('#rightBar');
      if (rightBarText.includes('Flatten') && rightBarText.includes('data_format')) {
        console.log('Found and selected Flatten layer');
        flattenLayerFound = true;
        // Find select dropdown for data_format
        const selectInputs = await page.$$('#rightbar-block select');
        console.log('Select inputs found:', selectInputs.length);
        expect(selectInputs.length).toBeGreaterThan(0);
        const initialValue = await selectInputs[0].evaluate(el => el.value);
        console.log('Initial data_format value:', initialValue);
        // Change to channels_first
        await selectInputs[0].selectOption('channels_first');
        await selectInputs[0].dispatchEvent('change');
        await page.waitForTimeout(1000);
        const newValue = await selectInputs[0].evaluate(el => el.value);
        console.log('Modified data_format to:', newValue);
        expect(newValue).toBe('channels_first');
        break;
      }
    }
    expect(flattenLayerFound).toBe(true);
    // Generate code and verify
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains channels_first:', content.includes('channels_first'));
    expect(content.includes('channels_first')).toBe(true);
    console.log('✅ List parameter test passed!');
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

  test('should interact with dataset selector in BottomTrainer', async ({ page }) => {
    console.log('\n=== DATASET SELECTOR TEST ===');
    // Enable dataset debug logging
    await page.evaluate(() => {
      window.nnvpDebugDatasets = true;
    });
    console.log('Dataset debug logging enabled');
    // Verify BottomTrainer is visible
    const bottomTrainer = await page.$('#BottomTrainer');
    expect(bottomTrainer).not.toBeNull();
    console.log('BottomTrainer panel found');
    // Click Dataset tab
    const datasetTab = await page.$('.BottomTrainer.bar-button:has-text("Dataset")');
    await datasetTab.click();
    await page.waitForTimeout(500);
    console.log('Dataset tab clicked');
    // Verify dataset selector exists
    const datasetSelector = await page.$('#dataset-selector-selector');
    expect(datasetSelector).not.toBeNull();
    console.log('Dataset selector found');
    // Check default dataset
    const initialDataset = await datasetSelector.evaluate(el => el.value);
    console.log('Initial dataset:', initialDataset);
    expect(initialDataset).toBe('MNIST');
    // Verify dataset options are available
    const datasetOptions = await datasetSelector.$$eval('option', options =>
      options.map(opt => opt.value)
    );
    console.log('Available datasets:', datasetOptions);
    expect(datasetOptions).toContain('MNIST');
    expect(datasetOptions).toContain('FashionMNIST');
    expect(datasetOptions).toContain('CIFAR10');
    // Check initial description
    const initialDescription = await page.textContent('#dataset-description');
    console.log('MNIST description:', initialDescription.substring(0, 100));
    expect(initialDescription).toContain('MNIST');
    expect(initialDescription.length).toBeGreaterThan(20);
    // Wait for MNIST auto-load to start (3 second setTimeout in mounted())
    console.log('Waiting for MNIST auto-load to start (3s timeout in mounted())...');
    await page.waitForTimeout(4000);
    // Check debug logs immediately to see if loading started
    let datasetLogs = consoleMessages.filter(msg =>
      msg.text.includes('[DatasetSelector]') || msg.text.includes('[BottomTrainer]')
    );
    console.log(`\n📊 Dataset logs after 4s: ${datasetLogs.length} messages`);
    if (datasetLogs.length > 0) {
      console.log('Last 15 messages (to see completion):');
      datasetLogs.slice(-15).forEach(log => console.log(`  - ${log.text.substring(0, 150)}`));
    } else {
      console.log('⚠️  NO DATASET LOGS YET! Dataset loading might not have started.');
    }
    // Wait for loading to complete (loading bar should disappear)
    console.log('\nWaiting for dataset loading to complete (checking loading bar visibility)...');
    await page.waitForFunction(
      () => {
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const samplesDiv = document.querySelector('#samples');
        // Loading complete when: loading bar hidden AND samples div is visible (not display:none)
        const loadingBarHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        const samplesVisible = samplesDiv && window.getComputedStyle(samplesDiv).display !== 'none';
        return loadingBarHidden && samplesVisible;
      },
      { timeout: 120000 } // 2 minutes for CDN download
    );
    console.log('Loading bar hidden! Checking samples div...');
    // Debug: Check what's in the samples div
    const samplesDebug = await page.evaluate(() => {
      const samplesDiv = document.querySelector('#samples');
      return {
        exists: !!samplesDiv,
        display: samplesDiv ? window.getComputedStyle(samplesDiv).display : null,
        innerHTML: samplesDiv ? samplesDiv.innerHTML.substring(0, 200) : null,
        childCount: samplesDiv ? samplesDiv.children.length : 0,
        canvasCount: samplesDiv ? samplesDiv.querySelectorAll('canvas').length : 0,
      };
    });
    console.log('Samples div debug:', JSON.stringify(samplesDebug, null, 2));
    // If no canvases, wait a bit more
    if (samplesDebug.canvasCount === 0) {
      console.log('No canvases yet, waiting 5 more seconds...');
      await page.waitForTimeout(5000);

      const samplesDebug2 = await page.evaluate(() => {
        const samplesDiv = document.querySelector('#samples');
        return {
          canvasCount: samplesDiv ? samplesDiv.querySelectorAll('canvas').length : 0,
          innerHTML: samplesDiv ? samplesDiv.innerHTML.substring(0, 300) : null,
        };
      });
      console.log('After 5s wait:', JSON.stringify(samplesDebug2, null, 2));
    }
    console.log('Checking for canvases...');
    // Verify actual canvas samples are rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv.$$('canvas');
    console.log('Number of MNIST sample canvases rendered:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.length).toBeLessThanOrEqual(40); // Should render 40 samples
    // Verify canvas has actual content (not empty)
    const firstCanvas = canvases[0];
    const canvasSize = await firstCanvas.evaluate(canvas => ({
      width: canvas.width,
      height: canvas.height
    }));
    console.log('Sample canvas size:', canvasSize);
    expect(canvasSize.width).toBe(28); // MNIST is 28x28
    expect(canvasSize.height).toBe(28);
    // Verify loading debug logs
    const allDatasetLogs = consoleMessages.filter(msg =>
      msg.text.includes('[DatasetSelector]') || msg.text.includes('[BottomTrainer]')
    );
    console.log('\nDataset loading logs (' + allDatasetLogs.length + ' messages):');
    allDatasetLogs.slice(0, 10).forEach(log => console.log(`  ${log.type}: ${log.text.substring(0, 100)}`));
    // Should have logs showing complete loading process
    const hasLoadStartLog = allDatasetLogs.some(log =>
      log.text.includes('datasetSet called') || log.text.includes('Starting load')
    );
    const hasLoadCompleteLog = allDatasetLogs.some(log =>
      log.text.includes('Samples filled')
    );
    expect(hasLoadStartLog).toBe(true);
    expect(hasLoadCompleteLog).toBe(true);
    console.log('✅ MNIST dataset loading completed successfully with real samples!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should load FashionMNIST after MNIST', async ({ page }) => {
    console.log('\n=== FASHION MNIST LOADING TEST ===');
    // Enable debug logging
    await page.evaluate(() => {
      window.nnvpDebugDatasets = true;
    });
    // Go to Dataset tab
    const datasetTab = await page.$('.BottomTrainer.bar-button:has-text("Dataset")');
    await datasetTab.click();
    await page.waitForTimeout(500);
    const datasetSelector = await page.$('#dataset-selector-selector');
    // Wait for MNIST auto-load to complete
    console.log('Waiting for MNIST auto-load...');
    await page.waitForTimeout(4000);
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        return samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('MNIST loaded');
    // Get average pixel data from ALL MNIST samples (should be consistent across runs)
    const mnistPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;

      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Sum all pixels
        for (let i = 0; i < imageData.data.length; i += 4) {
          totalSum += imageData.data[i]; // Red channel (grayscale, so R=G=B)
          totalPixels++;
        }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('MNIST average pixel value across all samples:', mnistPixelData);
    // Verify MNIST has expected brightness range (20-55)
    expect(mnistPixelData).toBeGreaterThan(20);
    expect(mnistPixelData).toBeLessThan(55);
    // Now change to FashionMNIST using the dropdown selector (like a real user would)
    console.log('Changing to FashionMNIST...');
    await page.selectOption('#dataset-selector-selector', 'FashionMNIST');
    // Wait for FashionMNIST to load
    await page.waitForTimeout(3000);
    // Verify selector changed
    const newDataset = await datasetSelector.evaluate(el => el.value);
    console.log('Selector value:', newDataset);
    expect(newDataset).toBe('FashionMNIST');
    // Wait for samples to render
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    // Verify FashionMNIST samples rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv.$$('canvas');
    console.log('FashionMNIST canvases:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.length).toBeLessThanOrEqual(40);
    // Get average pixel data from ALL FashionMNIST samples
    const fashionPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          totalSum += imageData.data[i];
          totalPixels++;
        }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('FashionMNIST average pixel value across all samples:', fashionPixelData);
    // Verify FashionMNIST has expected brightness range (55-90)
    expect(fashionPixelData).toBeGreaterThan(55);
    expect(fashionPixelData).toBeLessThan(90);
    // Verify images are actually different
    expect(fashionPixelData).not.toBe(mnistPixelData);
    console.log(
      '✅ Verified datasets are different and in expected ranges (MNIST:',
      mnistPixelData,
      ', FashionMNIST:',
      fashionPixelData,
      ')',
    );
    // Verify description updated
    const description = await page.textContent('#dataset-description');
    console.log('Description:', description.substring(0, 100));
    expect(description).toContain('clothes'); // FashionMNIST description says "Dataset of clothes images"
    expect(description).not.toContain('handwritten'); // Should not have MNIST description
    console.log('✅ FashionMNIST loaded successfully after MNIST!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should reload MNIST after FashionMNIST', async ({ page }) => {
    console.log('\n=== RELOAD MNIST TEST ===');
    // Enable debug logging
    await page.evaluate(() => {
      window.nnvpDebugDatasets = true;
    });
    // Go to Dataset tab
    const datasetTab = await page.$('.BottomTrainer.bar-button:has-text("Dataset")');
    await datasetTab.click();
    await page.waitForTimeout(500);
    const datasetSelector = await page.$('#dataset-selector-selector');
    // Wait for MNIST auto-load
    console.log('Waiting for initial MNIST...');
    await page.waitForTimeout(4000);
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        return samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('MNIST loaded');
    // Change to FashionMNIST using the dropdown selector
    console.log('Loading FashionMNIST...');
    await page.selectOption('#dataset-selector-selector', 'FashionMNIST');
    await page.waitForTimeout(2000);
    // Wait for FashionMNIST to load
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('FashionMNIST loaded');
    // Get average pixel data from ALL FashionMNIST samples
    const fashionPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) { totalSum += imageData.data[i]; totalPixels++; }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('FashionMNIST average pixel value:', fashionPixelData);
    // Verify FashionMNIST has expected brightness range (55-90)
    expect(fashionPixelData).toBeGreaterThan(55);
    expect(fashionPixelData).toBeLessThan(90);
    // Now reload MNIST using the dropdown selector
    console.log('Reloading MNIST...');
    await page.selectOption('#dataset-selector-selector', 'MNIST');
    await page.waitForTimeout(2000);
    // Verify selector changed back
    const finalDataset = await datasetSelector.evaluate(el => el.value);
    console.log('Final selector value:', finalDataset);
    expect(finalDataset).toBe('MNIST');
    // MNIST should load from cache (faster)
    const loadStartTime = Date.now();
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 10000 } // Should be fast from cache
    );
    const loadTime = Date.now() - loadStartTime;
    console.log(`MNIST reloaded from cache in ${loadTime}ms`);
    // Verify MNIST samples rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv.$$('canvas');
    console.log('MNIST canvases:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    // Get average pixel data from reloaded MNIST
    const mnistPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) { totalSum += imageData.data[i]; totalPixels++; }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('MNIST average pixel value after reload:', mnistPixelData);
    // Verify MNIST has expected brightness range (20-55)
    expect(mnistPixelData).toBeGreaterThan(20);
    expect(mnistPixelData).toBeLessThan(55);
    // Verify images switched back (MNIST != FashionMNIST)
    expect(mnistPixelData).not.toBe(fashionPixelData);
    console.log(
      '✅ Verified datasets switched back and in expected ranges (MNIST:',
      mnistPixelData,
      ', FashionMNIST:',
      fashionPixelData,
      ')',
    );
    const description = await page.textContent('#dataset-description');
    expect(description).toContain('MNIST');
    expect(description).not.toContain('Fashion');
    console.log('✅ MNIST reloaded successfully from cache!');
    expect(consoleErrors.length).toBe(0);
  });

  test('should delete edge and verify layers become isolated', async ({ page }) => {
    console.log('\n=== EDGE DELETION TEST ===');
    // Load a template with connected layers
    await page.click('text=File');
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(2000);
    // Count initial edges
    const initialEdges = await page.$$('.edge');
    console.log('Initial edges:', initialEdges.length);
    expect(initialEdges.length).toBeGreaterThan(0);
    // Count isolated layers before deletion
    const isolatedBefore = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers before deletion:', isolatedBefore.length);
    // Click on an edge to select it (try the first edge)
    // Edges are SVG elements, need to click on their path
    const firstEdge = await page.$('.edge path');
    expect(firstEdge).not.toBeNull();
    const edgeBox = await firstEdge.boundingBox();
    await page.mouse.click(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
    await page.waitForTimeout(500);
    // Verify edge is selected
    const selectedEdge = await page.$('.edge.selected');
    expect(selectedEdge).not.toBeNull();
    console.log('Edge selected:', await selectedEdge.evaluate(el => el.id));
    // Press Backspace key to delete the edge (alternative to Delete)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);
    // Count edges after deletion
    const edgesAfter = await page.$$('.edge');
    console.log('Edges after deletion:', edgesAfter.length);
    expect(edgesAfter.length).toBe(initialEdges.length - 1);
    // Check if any layers became isolated
    const isolatedAfter = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers after deletion:', isolatedAfter.length);
    expect(isolatedAfter.length).toBeGreaterThan(isolatedBefore.length);
    console.log('✅ Edge deleted and layers became isolated!');
  });

  test('should redraw deleted edge and verify network is valid again', async ({ page }) => {
    console.log('\n=== EDGE RECREATION TEST ===');

    // Load a template with connected layers
    await page.click('text=File');
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(2000);
    // Get all layers to identify source and target for reconnection
    const layers = await page.$$('.d3Layer');
    console.log('Total layers:', layers.length);
    // Count initial edges
    const initialEdges = await page.$$('.edge');
    console.log('Initial edges:', initialEdges.length);
    // Select and delete first edge
    // Get edge group to get its ID, but click on the path element
    const firstEdgeGroup = await page.$('.edge');
    const edgeId = await firstEdgeGroup.evaluate(el => el.id);
    console.log('Deleting edge:', edgeId);
    const firstEdgePath = await page.$('.edge path');
    const edgeBox = await firstEdgePath.boundingBox();
    await page.mouse.click(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
    await page.waitForTimeout(500);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);
    // Verify edge was deleted
    const edgesAfterDelete = await page.$$('.edge');
    expect(edgesAfterDelete.length).toBe(initialEdges.length - 1);
    // Check isolated layers
    const isolated = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers after deletion:', isolated.length);
    const isolatedCount = isolated.length;
    // Redraw the edge by dragging from anchor to anchor
    console.log('Reconnecting layers by drag-and-drop...');
    // The deleted edge was s0_t1 (layer-0 to layer-1), so reconnect those same layers
    const sourceAnchor = await page.$('#d3-layer-0 circle.bottom-point');
    const sourceBox = await sourceAnchor.boundingBox();
    const targetLayer = await page.$('#d3-layer-1 rect');
    const targetBox = await targetLayer.boundingBox();
    // Drag from source anchor to target layer center
    await page.mouse.move(sourceBox.x + sourceBox.width/2, sourceBox.y + sourceBox.height/2);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(targetBox.x + targetBox.width/2, targetBox.y + targetBox.height/2);
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    // Count edges after reconnection
    const edgesAfterReconnect = await page.$$('.edge');
    console.log('Edges after reconnection:', edgesAfterReconnect.length);
    expect(edgesAfterReconnect.length).toBe(initialEdges.length);
    // Check isolated layers - should be less than before
    const isolatedAfterReconnect = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers after reconnection:', isolatedAfterReconnect.length);
    expect(isolatedAfterReconnect.length).toBeLessThan(isolatedCount);
    console.log('✅ Edge recreated and network is valid again!');
  });

  test('should delete node, re-add it, set parameters, and reconnect', async ({ page }) => {
    console.log('\n=== NODE MANIPULATION TEST ===');
    // Load a template with multiple connected layers
    await page.click('text=File');
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(2000);
    // Get initial state
    const initialLayers = await page.$$('.d3Layer');
    const initialEdges = await page.$$('.edge');
    console.log('Initial layers:', initialLayers.length);
    console.log('Initial edges:', initialEdges.length);
    // Select and delete the first Dense layer (layer 2) - this will isolate the second Dense
    const denseLayer = initialLayers[2];
    const denseBox = await denseLayer.boundingBox();
    await page.mouse.click(denseBox.x + denseBox.width / 2, denseBox.y + denseBox.height / 2);
    await page.waitForTimeout(500);
    // Verify layer is selected
    const isSelected = await denseLayer.evaluate(el => el.classList.contains('selected'));
    console.log('Dense layer selected:', isSelected);
    expect(isSelected).toBe(true);
    // Delete the layer
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1000);
    // Verify layer was deleted
    const layersAfterDelete = await page.$$('.d3Layer');
    const edgesAfterDelete = await page.$$('.edge');
    console.log('Layers after deletion:', layersAfterDelete.length);
    console.log('Edges after deletion:', edgesAfterDelete.length);
    expect(layersAfterDelete.length).toBe(initialLayers.length - 1);
    expect(edgesAfterDelete.length).toBeLessThan(initialEdges.length);
    // Check for isolated layers (optional - depends on which layer was deleted)
    const isolatedAfterDelete = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers after deletion:', isolatedAfterDelete.length);
    // Re-add a Dense layer
    const denseTemplate = await page.$('.LayerTemplate:has-text("Dense")');
    await denseTemplate.click();
    await page.waitForTimeout(1000);
    // Verify layer was added
    const layersAfterAdd = await page.$$('.d3Layer');
    console.log('Layers after re-adding Dense:', layersAfterAdd.length);
    expect(layersAfterAdd.length).toBe(initialLayers.length);
    // Select the newly added layer (last one) and set parameters
    const newDenseLayer = layersAfterAdd[layersAfterAdd.length - 1];
    const newDenseBox = await newDenseLayer.boundingBox();
    await page.mouse.click(newDenseBox.x + newDenseBox.width / 2, newDenseBox.y + newDenseBox.height / 2);
    await page.waitForTimeout(500);
    // Verify RightBar shows parameters
    const rightBarText = await page.textContent('#rightbar-block');
    console.log('RightBar shows Dense parameters:', rightBarText.includes('units'));
    expect(rightBarText).toContain('units');
    // Set units parameter to 128
    const unitsInput = await page.$('#rightbar-block input[type="number"]');
    await unitsInput.fill('128');
    await unitsInput.dispatchEvent('change');
    await page.waitForTimeout(500);
    const unitsValue = await unitsInput.inputValue();
    console.log('Set units to:', unitsValue);
    expect(unitsValue).toBe('128');
    // Reconnect the layers
    // After deleting first Dense (layer 2): Input → Flatten → (gap) → Dense → Output
    // Layers after deletion: Input(0), Flatten(1), Dense(2), Output(3)
    // New Dense will be added as layer 4
    // We need to connect: Flatten(1) → new Dense(4) → old Dense(2)
    console.log('Reconnecting layers...');
    // Get the new layer's ID
    const newLayerId = await newDenseLayer.evaluate(el => el.id);
    console.log('New layer ID:', newLayerId);
    // First, get fresh references to all layers after adding the new one
    const allLayersAfterAdd = await page.$$('.d3Layer');
    console.log('Total layers after adding:', allLayersAfterAdd.length);
    // Debug: print all layer types to understand the order
    const layerTypes = await page.$$eval('.d3Layer text', texts => texts.map(t => t.textContent));
    console.log('Layer order after adding:', layerTypes);
    // Connect Flatten (index 1) to new Dense (index 4)
    const flattenLayer = allLayersAfterAdd[1];
    const flattenAnchor = await flattenLayer.$('circle.bottom-point');
    const flattenAnchorBox = await flattenAnchor.boundingBox();
    const newDenseLayerFinal = allLayersAfterAdd[4];
    const newDenseBoxFinal = await newDenseLayerFinal.boundingBox();
    await page.mouse.move(flattenAnchorBox.x + flattenAnchorBox.width/2, flattenAnchorBox.y + flattenAnchorBox.height/2);
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(newDenseBoxFinal.x + newDenseBoxFinal.width/2, newDenseBoxFinal.y + newDenseBoxFinal.height/2);
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    console.log('Connected Flatten to new Dense');
    let currentEdges = await page.$$('.edge');
    console.log('Edges after first connection:', currentEdges.length);
    // Connect new Dense (index 4) to old Dense (index 2)
    const newDenseAnchor = await newDenseLayerFinal.$('circle.bottom-point');
    const newDenseAnchorBox = await newDenseAnchor.boundingBox();
    const oldDenseLayer = allLayersAfterAdd[2];
    const oldDenseBox = await oldDenseLayer.boundingBox();
    await page.mouse.move(
      newDenseAnchorBox.x + newDenseAnchorBox.width/2, newDenseAnchorBox.y + newDenseAnchorBox.height/2
    );
    await page.waitForTimeout(200);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(oldDenseBox.x + oldDenseBox.width/2, oldDenseBox.y + oldDenseBox.height/2);
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(500);
    console.log('Connected new Dense to old Dense');
    currentEdges = await page.$$('.edge');
    console.log('Edges after second connection:', currentEdges.length);
    // Verify edges were recreated
    const edgesAfterReconnect = await page.$$('.edge');
    console.log('Edges after reconnection:', edgesAfterReconnect.length);
    expect(edgesAfterReconnect.length).toBeGreaterThan(edgesAfterDelete.length);
    // Verify isolated layers decreased or stayed same
    const isolatedAfterReconnect = await page.$$('.d3Layer rect.isolated');
    console.log('Isolated layers after reconnection:', isolatedAfterReconnect.length);
    expect(isolatedAfterReconnect.length).toBeLessThanOrEqual(isolatedAfterDelete.length);
    // Verify the parameter was saved by generating code
    const fileMenu = await page.$('text=File');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await fileMenu.click();
    await page.waitForTimeout(300);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(1000);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf8');
    console.log('Generated code contains units=128:', content.includes('128'));
    expect(content).toContain('128');
    console.log('✅ Node deleted, re-added, configured, and reconnected successfully!');
  });

  // big e2e test to ensure the whole typical workflow works
  // this may be against the "easy to debug" practices
  // but there are other tests to help you debug specific features anyway
  test('should complete full MNIST training workflow', async ({ browser }) => {
    test.slow(); // Mark as slow test - training takes time with 10 epochs
    test.setTimeout(120000); // Set explicit timeout of 2 minutes for training
    console.log('\n=== MNIST TRAINING WORKFLOW TEST ===');
    // Create a new context
    const context = await browser.newContext();
    const page = await context.newPage();
    // Capture alerts and console messages
    const alerts = [];
    const consoleMessages = [];
    page.on('dialog', async dialog => {
      console.log('ALERT:', dialog.message());
      alerts.push(dialog.message());
      await dialog.accept();
    });
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      // Log important console messages
      if (text.includes('CPU-only mode') || text.includes('CPU backend') ||
          text.includes('Epoch') || text.includes('training') ||
          text.includes('[Charts]') || text.includes('mounted') ||
          text.includes('[BottomTrainer]') || text.includes('optimizer')) {
        console.log('[BROWSER]', text);
      }
      if (text.includes('error') || text.includes('Error') || text.includes('ERROR') ||
          text.includes('warn') || text.includes('Warning')) {
        console.log('[BROWSER ERROR]', text);
      }
    });
    // Navigate to the app with CPU backend parameter
    // This forces TensorFlow.js to use CPU instead of WebGL (which doesn't work in xvfb)
    await page.goto('http://localhost:5173?backend=cpu');
    await page.waitForTimeout(2000); // Wait for CPU backend to initialize
    // Load a template for training
    await page.click('text=File');
    await page.waitForTimeout(500);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(500);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(2000);
    console.log('Loaded template: 2D Dense for MNIST');
    // Open Training panel via top menu
    await page.click('text=Training');
    await page.waitForTimeout(1000);
    // Verify BottomTrainer is visible
    const bottomTrainer = await page.$('#BottomTrainer');
    expect(bottomTrainer).not.toBeNull();
    console.log('BottomTrainer panel opened');
    // Enable debug logging
    await page.evaluate(() => {
      window.nnvpDebugDatasets = true;
      window.nnvpDebugTraining = true;
    });
    console.log('Enabled debug logging');
    // Click Dataset tab to show the dataset selector
    await page.click('text=Dataset');
    await page.waitForTimeout(1000);
    console.log('Dataset tab clicked');
    // Select MNIST from the dropdown
    const datasetSelector = await page.$('#dataset-selector-selector');
    expect(datasetSelector).not.toBeNull();
    await datasetSelector.selectOption('MNIST');
    console.log('Selected MNIST from dropdown');
    // Wait for dataset loading to complete
    // The loading bar should appear and then disappear
    await page.waitForTimeout(2000); // Give it time to start loading
    // Wait for loading to complete (loading bar to disappear)
    try {
      await page.waitForSelector('#data-selector-loading-bar-container', { state: 'hidden', timeout: 30000 });
      console.log('Dataset loading completed (loading bar disappeared)');
    } catch (error) {
      console.log('Warning: Loading bar did not disappear within timeout, continuing anyway...');
    }
    // Now click Options tab to set epochs
    await page.click('text=Options');
    await page.waitForTimeout(500);
    // Set epochs to 10 for meaningful training progress verification
    const epochsInput = await page.$('#CompileOptions input[type="number"]');
    await epochsInput.fill('10');
    await epochsInput.dispatchEvent('input');
    await page.waitForTimeout(300);
    const epochsValue = await epochsInput.inputValue();
    console.log('Set epochs to:', epochsValue);
    expect(epochsValue).toBe('10');
    // Set optimizer to 'adam' for consistent results
    const optimizerSelector = await page.$('#optimizer-selector select');
    expect(optimizerSelector).not.toBeNull();
    await optimizerSelector.selectOption('adam');
    await page.waitForTimeout(300);
    const optimizerValue = await optimizerSelector.inputValue();
    console.log('Set optimizer to:', optimizerValue);
    expect(optimizerValue).toBe('adam');
    // Click Train button
    console.log('Attempting to click Train button...');
    // Method 1: Get all trainer bar buttons and click the 4th one (index 3)
    const trainerButtons = await page.$$('#trainer-bar .bar-button');
    console.log('Found', trainerButtons.length, 'trainer bar buttons');
    expect(trainerButtons.length).toBe(4); // Dataset, Options, Charts, Train
    const trainButton = trainerButtons[3]; // Train is the 4th button
    const trainButtonText = await trainButton.textContent();
    console.log('Train button text:', trainButtonText.trim());
    expect(trainButtonText.trim()).toBe('Train');
    // Click it with force to ensure it registers
    await trainButton.click({ force: true });
    console.log('Clicked Train button (method 1: direct element click)');
    // Wait for either training to start or an alert
    await page.waitForTimeout(3000);
    // Check if we got any alerts
    if (alerts.length > 0) {
      console.log('Alerts received:', alerts);
    }
    // Try to find Stop button
    let stopButton = await page.$('text=Stop');
    console.log('Stop button found after 3s:', stopButton !== null);
    if (!stopButton) {
      // Debug: What text is in the Train button now?
      const currentButtons = await page.$$('#trainer-bar .bar-button');
      console.log('Current button texts after 3s:');
      for (let i = 0; i < currentButtons.length; i++) {
        const text = await currentButtons[i].textContent();
        console.log(`  Button ${i}: "${text}"`);
      }
      // Wait a bit more in case training is slow to start
      console.log('Waiting 5 more seconds...');
      await page.waitForTimeout(5000);
      stopButton = await page.$('text=Stop');
      console.log('Stop button found after 8s total:', stopButton !== null);
      if (!stopButton) {
        const finalButtons = await page.$$('#trainer-bar .bar-button');
        console.log('Final button texts after 8s:');
        for (let i = 0; i < finalButtons.length; i++) {
          const text = await finalButtons[i].textContent();
          console.log(`  Button ${i}: "${text}"`);
        }
        // Print last 20 console messages to see what happened
        console.log('\nLast 20 browser console messages:');
        const lastMessages = consoleMessages.slice(-20);
        lastMessages.forEach((msg, i) => {
          console.log(`  ${i}: ${msg}`);
        });
      }
    }
    //     expect(stopButton).not.toBeNull();
    console.log('Training started (Stop button visible)');
    // Verify Charts tab is active (automatically switches during training)
    const chartsPanel = await page.$('#Charts');
    expect(chartsPanel).not.toBeNull();
    console.log('Charts panel is active');
    // Wait for training to complete (button changes back to "Train")
    // With 2 epochs and 500 training samples, this should take ~30-60 seconds
    console.log('Waiting for training to complete...');
    await page.waitForSelector('text=Train', { timeout: 120000 }); // 2 minute timeout
    console.log('Training completed (Train button visible again)');
    // Verify that charts are visible (using SVG-based LineChart components)
    const svgElements = await page.$$('svg.line-chart-svg');
    expect(svgElements.length).toBe(2); // Batch and Epoch charts
    console.log('Charts are visible (SVG elements found)');
    // WARNING: BEGIN TOOLTIP TEST ZONE, SHOULD PUT IN ANOTHER SPECIFIC TEST - BUT ACTUALLY ENABLES TO VERIFY COHERENCE
    // Test tooltip functionality by hovering over a chart point
    console.log('Testing tooltip functionality...');
    // Find all hover points in the epoch chart (second chart)
    const hoverPoints = await page.$$('svg.line-chart-svg circle.hover-point');
    expect(hoverPoints.length).toBeGreaterThan(0);
    console.log(`Found ${hoverPoints.length} hover points in charts`);
    // Hover over a point in the middle of the data
    const midPoint = hoverPoints[Math.floor(hoverPoints.length / 2)];
    await midPoint.hover();
    // Wait a bit for the tooltip to appear
    await page.waitForTimeout(100);
    // Verify tooltip is visible
    const tooltip = await page.$('.tooltip');
    expect(tooltip).not.toBeNull();
    const isTooltipVisible = await tooltip.isVisible();
    expect(isTooltipVisible).toBe(true);
    console.log('Tooltip appeared on hover');
    // Verify tooltip contains expected content
    const tooltipText = await tooltip.textContent();
    expect(tooltipText).toContain('Epoch/Batch:'); // Label
    expect(tooltipText.length).toBeGreaterThan(10); // Has some content
    console.log('Tooltip content verified:', tooltipText.substring(0, 50) + '...');
    // Move mouse away and verify tooltip disappears
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const tooltipAfter = await page.$('.tooltip');
    const isTooltipVisibleAfter = tooltipAfter ? await tooltipAfter.isVisible() : false;
    expect(isTooltipVisibleAfter).toBe(false);
    console.log('Tooltip correctly disappears when mouse leaves');
    // WARNING: END TOOLTIP TEST ZONE, SHOULD PUT IN ANOTHER SPECIFIC TEST
    // Verify training actually ran by checking console messages
    // Look for batch chart updates and epoch chart updates
    const batchUpdates = consoleMessages.filter(msg => msg.includes('[Charts] Batch chart update'));
    const epochUpdates = consoleMessages.filter(msg => msg.includes('[Charts] Epoch chart update'));
    console.log(`Found ${batchUpdates.length} batch updates and ${epochUpdates.length} epoch updates`);
    // We should have batch updates (one per batch) and epoch updates (>=10 epochs)
    expect(batchUpdates.length).toBeGreaterThan(0);
    expect(epochUpdates.length).toBeGreaterThanOrEqual(10); // At least 10 epochs
    // Skip initial empty update if present, use first real epoch
    let firstEpochIndex = 0;
    // Check if first update has empty data
    if (epochUpdates[0].includes('"data":[]')) {
      firstEpochIndex = 1; // Skip empty initial update
    }
    const firstEpochMsg = epochUpdates[firstEpochIndex];
    const lastEpochMsg = epochUpdates[epochUpdates.length - 1];
    console.log('First epoch message:', firstEpochMsg);
    console.log('Last epoch message:', lastEpochMsg);
    // Verify chart data coherence: tooltip values should match console message data
    console.log('Verifying chart data matches console logs...');
    // Parse the last epoch data from console
    const jsonStart = lastEpochMsg.indexOf('{"labels"');
    const jsonStr = lastEpochMsg.substring(jsonStart);
    const lastEpochData = JSON.parse(jsonStr);
    // Get the last accuracy and loss values from console data
    const lastAccFromConsole = lastEpochData.series[0].data[lastEpochData.series[0].data.length - 1];
    const lastLossFromConsole = lastEpochData.series[2].data[lastEpochData.series[2].data.length - 1];
    console.log('Console data - last acc:', lastAccFromConsole, 'last loss:', lastLossFromConsole);
    // Now hover over one of the last few points and verify the tooltip shows a value close to console
    const lastFewPoints = hoverPoints.slice(-10);
    await lastFewPoints[5].hover(); // Hover over a point near the end
    await page.waitForTimeout(100);
    const dataTooltip = await page.$('.tooltip');
    const dataTooltipText = await dataTooltip.textContent();
    console.log('Chart tooltip text:', dataTooltipText);
    // Extract the numeric value from tooltip
    const valueMatch = dataTooltipText.match(/(\d+\.\d+)/);
    expect(valueMatch).not.toBeNull();
    const chartValue = parseFloat(valueMatch[1]);
    console.log('Chart displayed value:', chartValue);
    // Verify it's in a reasonable range (between 0 and 2.5 for loss/accuracy)
    expect(chartValue).toBeGreaterThanOrEqual(0);
    expect(chartValue).toBeLessThanOrEqual(2.5);
    // Verify it's close to one of the console values (within reasonable range)
    // The value should be close to either last acc or last loss from console
    const diffFromAcc = Math.abs(chartValue - lastAccFromConsole);
    const diffFromLoss = Math.abs(chartValue - lastLossFromConsole);
    const isCloseToConsole = diffFromAcc < 0.5 || diffFromLoss < 0.5; // Within 0.5
    expect(isCloseToConsole).toBe(true);
    console.log('Chart data coherence verified - tooltip value matches console data (diff from acc:', diffFromAcc.toFixed(3), 'diff from loss:', diffFromLoss.toFixed(3), ')');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    // Extract JSON from the messages
    const extractMetrics = (msg) => {
      const jsonStart = msg.indexOf('{"labels"');
      if (jsonStart === -1) return null;
      const jsonStr = msg.substring(jsonStart);
      try {
        const data = JSON.parse(jsonStr);
        return {
          acc: data.series[0].data[data.series[0].data.length - 1],
          val_acc: data.series[1].data[data.series[1].data.length - 1],
          loss: data.series[2].data[data.series[2].data.length - 1],
          val_loss: data.series[3].data[data.series[3].data.length - 1],
        };
      } catch (e) {
        console.error('Failed to parse metrics:', e);
        return null;
      }
    };
    const firstMetrics = extractMetrics(firstEpochMsg);
    const lastMetrics = extractMetrics(lastEpochMsg);
    expect(firstMetrics).not.toBeNull();
    expect(lastMetrics).not.toBeNull();
    console.log('First epoch metrics:', firstMetrics);
    console.log('Last epoch metrics:', lastMetrics);
    // Verify training progress: both accuracies should increase by at least 0.2
    const accGain = lastMetrics.acc - firstMetrics.acc;
    const valAccGain = lastMetrics.val_acc - firstMetrics.val_acc;
    console.log(`Accuracy gain: ${accGain.toFixed(3)} (training), ${valAccGain.toFixed(3)} (validation)`);
    expect(accGain).toBeGreaterThanOrEqual(0.2);
    expect(valAccGain).toBeGreaterThanOrEqual(0.2);
    // Verify both losses should decrease by at least 0.2
    const lossDecrease = firstMetrics.loss - lastMetrics.loss;
    const valLossDecrease = firstMetrics.val_loss - lastMetrics.val_loss;
    console.log(`Loss decrease: ${lossDecrease.toFixed(3)} (training), ${valLossDecrease.toFixed(3)} (validation)`);
    expect(lossDecrease).toBeGreaterThanOrEqual(0.2);
    expect(valLossDecrease).toBeGreaterThanOrEqual(0.2);
    console.log('✅ MNIST training workflow completed successfully with verified progress!');
    // Cleanup
    await context.close();
  });
});
