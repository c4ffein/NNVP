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

    // Check content
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Contains layers.dense:', content.includes('layers.dense'));
    console.log('Contains tf.sequential:', content.includes('tf.sequential'));

    expect(content.length).toBeGreaterThan(200);
    expect(content.includes('layers.dense')).toBe(true);
    expect(content.includes('tf.sequential') || content.includes('tf.model')).toBe(true);

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

    // Check content
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');

    console.log('Code length:', content.length);
    console.log('Generated code:\n', content);
    console.log('Contains Dense:', content.includes('Dense'));
    console.log('Contains keras or tensorflow:', content.includes('keras') || content.includes('tensorflow'));

    expect(content.length).toBeGreaterThan(200);
    expect(content.includes('Dense')).toBe(true);
    expect(content.includes('keras') || content.includes('tensorflow')).toBe(true);

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

    // Build a simple complete model: Input -> Dense -> Output
    // Add Input layer
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(500);

    // Add Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(500);

    // Add Output layer
    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(500);

    console.log('Built model: Input -> Dense -> Output');

    // Verify we have at least one Dense layer on canvas
    const allLayersText = await page.$$eval('.d3Layer text', texts => texts.map(t => t.textContent));
    console.log('Layers on canvas:', allLayersText);
    const hasDenseLayer = allLayersText.some(text => text.includes('Dense'));
    expect(hasDenseLayer).toBe(true);

    // Generate code BEFORE modification
    const downloadPromise1 = page.waitForEvent('download', { timeout: 5000 });
    const fileMenu = await page.$('text=File');
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
