/**
 * Migrated from tests/core-features.spec.js (part 2 of 3 — code generation
 * and parameter edits verified through generated code). Every test proves
 * its point by triggering a REAL browser download from File > Generate and
 * reading the artifact from disk, so all are e2eOnly mechanical wraps.
 * (Pure generator coverage runs in both modes via board.dual.js and the
 * KerasGenerator suites.)
 */
import fs from 'node:fs';
import { e2eOnly } from '../define';

// Replicates the original spec's beforeEach: attach console/pageerror
// collectors, then (re)load the app so load-time errors are captured too —
// the dual runner has already navigated once before the body runs.
async function startErrorTracking(page, canvas) {
  const consoleMessages = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleMessages.push({ type, text });
    if (type === 'error') {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`PAGE ERROR: ${error.message}`);
  });
  await page.goto(canvas.home);
  await page.waitForTimeout(50);
  return { consoleMessages, consoleErrors };
}

e2eOnly(
  'core: should generate JavaScript code from manually built network',
  'Builds the network with real anchor-to-anchor mouse drags, then triggers a browser download from File > Generate and compares the artifact read from disk against a golden master — download events exist only under the browser runner.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== MANUAL NETWORK BUILDING TEST (JS) ===');
    // Add layers by clicking (they'll be added to canvas)
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(50);
    const flattenLayer = await page.$('.LayerTemplate:has-text("Flatten")');
    await flattenLayer.click();
    await page.waitForTimeout(50);
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    await denseLayer.click(); // Second Dense
    await page.waitForTimeout(50);
    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(50);
    console.log('5 layers added to canvas');
    // Reposition layers vertically so the connect drags have room
    console.log('Repositioning layers vertically...');
    for (let i = 0; i < 5; i++) {
      await canvas.moveLayer(page, i, 300, 100 + i * 120);
    }
    await page.waitForTimeout(100);
    console.log('All layers repositioned');
    console.log('Connecting layers using drag-and-drop on anchors...');
    await page.waitForTimeout(500);
    // Drag from each layer's output anchor to the next layer to create connections
    for (let i = 0; i < 4; i++) {
      await canvas.connect(page, i, i + 1);
      await page.waitForTimeout(500);
      const currentEdges = await canvas.edgeCount(page);
      console.log(`Connected layer ${i} to layer ${i + 1}, total edges: ${currentEdges}`);
    }
    console.log('Finished connecting layers');
    // Set up listener for download or popup
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    // Open File menu and click Generate Javascript
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateJsOption = await page.$('text=Generate TF - JavaScript');
    await generateJsOption.click();
    await page.waitForTimeout(100);
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
  },
);

e2eOnly(
  'core: should generate Python code from manually built network',
  'Builds the network with real anchor-to-anchor mouse drags, then reads the Python artifact from a real browser download and compares it to a golden master — drags and downloads are browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== MANUAL NETWORK BUILDING TEST (Python) ===');
    // Add layers by clicking
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(50);
    const flattenLayer = await page.$('.LayerTemplate:has-text("Flatten")');
    await flattenLayer.click();
    await page.waitForTimeout(50);
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    await denseLayer.click(); // Second Dense
    await page.waitForTimeout(50);
    const outputLayer = await page.$('.LayerTemplate:has-text("Output")');
    await outputLayer.click();
    await page.waitForTimeout(50);
    console.log('5 layers added to canvas');
    // Wait for all layers to fully initialize
    await page.waitForTimeout(500);
    // Reposition layers vertically so the connect drags have room
    console.log('Repositioning layers vertically...');
    for (let i = 0; i < 5; i++) {
      await canvas.moveLayer(page, i, 300, 100 + i * 120);
    }
    await page.waitForTimeout(100);
    console.log('All layers repositioned');
    console.log('Connecting layers using drag-and-drop on anchors...');
    // Extra wait before drag-and-drop operations for board stabilization
    await page.waitForTimeout(500);
    // Drag to connect layers
    for (let i = 0; i < 4; i++) {
      await canvas.connect(page, i, i + 1);
      await page.waitForTimeout(100);
      const currentEdges = await canvas.edgeCount(page);
      console.log(`Connected layer ${i} to layer ${i + 1}, total edges: ${currentEdges}`);
    }
    console.log('Finished connecting layers');
    // Set up listener for download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    // Open File menu and click Generate
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate TF - Python');
    const generateText = await generateOption.textContent();
    expect(generateText.trim()).toBe('Generate TF - Python');
    await generateOption.click();
    await page.waitForTimeout(100);
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
    const expectedPython = `import keras

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
  },
);

e2eOnly(
  'core: should generate JavaScript code from template',
  'Discovers a template through the hover-opened File > Templates submenu DOM, then reads the generated JavaScript from a real browser download — menu chrome traversal and download events are browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== JAVASCRIPT GENERATION FROM TEMPLATE TEST ===');
    // Load a template
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(30);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
    const uiCommands = ['New', 'Load', 'Save', 'Generate TF - Python', 'Generate TF - JavaScript', 'Generate PyTorch', 'Generate Tinygrad', 'Templates'];
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
    await page.waitForTimeout(100);
    // Generate JavaScript code
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateJsOption = await page.$('text=Generate TF - JavaScript');
    await generateJsOption.click();
    await page.waitForTimeout(100);
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
  },
);

e2eOnly(
  'core: should generate Python code from template',
  'Discovers a template through the hover-opened File > Templates submenu DOM, then reads the generated Python from a real browser download — menu chrome traversal and download events are browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== PYTHON GENERATION FROM TEMPLATE TEST ===');
    // Load a template
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(30);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
    const uiCommands = ['New', 'Load', 'Save', 'Generate TF - Python', 'Generate TF - JavaScript', 'Generate PyTorch', 'Generate Tinygrad', 'Templates'];
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
    await page.waitForTimeout(100);
    // Generate Python code
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate TF - Python');
    const generateText = await generateOption.textContent();
    expect(generateText.trim()).toBe('Generate TF - Python');
    await generateOption.click();
    await page.waitForTimeout(100);
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
  },
);

e2eOnly(
  'core: should modify int parameter and verify in generated code',
  'Selects nodes by boundingBox mouse clicks, edits the units number input in the rendered right panel, and proves the change through two real code downloads (before/after) read from disk.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== INT PARAMETER MODIFICATION TEST ===');
    // Load a template to get a complete connected network
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(50);
    // Hover over Templates to open submenu
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    // Select "2D Dense for MNIST" template from submenu
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    console.log('Loaded template: 2D Dense for MNIST');
    // Verify we have Dense layers
    const allLayersText = await canvas.layerLabels(page);
    console.log('Layers on canvas:', allLayersText);
    const hasDenseLayer = allLayersText.some(text => text.includes('Dense'));
    expect(hasDenseLayer).toBe(true);
    // Generate code BEFORE modification
    const downloadPromise1 = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateOption1 = await page.$('text=Generate');
    await generateOption1.click();
    await page.waitForTimeout(100);
    const download1 = await downloadPromise1;
    const path1 = await download1.path();
    const contentBefore = fs.readFileSync(path1, 'utf-8');
    console.log('Code before modification length:', contentBefore.length);
    console.log('Code before contains "Dense":', contentBefore.includes('Dense'));
    // Now select the Dense layer and modify its parameter
    const layersOnCanvas = await page.$$(canvas.layer);
    let denseLayerFound = false;
    console.log('Attempting to find and select Dense layer...');
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      // Use mouse.click to bypass text element interception
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      const rightBarText = await page.textContent('#layerOptions');
      console.log(`Layer ${i}: First 80 chars of rightbar: "${rightBarText.substring(0, 80)}"`);
      if (rightBarText.includes('Dense') && rightBarText.includes('units')) {
        console.log('Found and selected Dense layer');
        denseLayerFound = true;
        // Check if layeroptions-block is visible
        const rightbarBlock = await page.$('#layeroptions-block');
        expect(rightbarBlock).not.toBeNull();
        // Find and modify the "units" parameter
        const numberInputs = await page.$$('#layeroptions-block input[type="number"]');
        console.log('Number inputs found:', numberInputs.length);
        expect(numberInputs.length).toBeGreaterThan(0);
        const initialValue = await numberInputs[0].inputValue();
        console.log('Initial units value:', initialValue);
        // Change to a distinctive value: 256
        await numberInputs[0].fill('256');
        await numberInputs[0].dispatchEvent('change');
        await page.waitForTimeout(50);
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
    await page.waitForTimeout(30);
    const generateOption2 = await page.$('text=Generate');
    await generateOption2.click();
    await page.waitForTimeout(100);
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
  },
);

e2eOnly(
  'core: should modify float parameter and verify in generated code',
  'Drives the Dropout rate range slider in the rendered right panel (fill + change event) after boundingBox node selection, verified through before/after real code downloads read from disk.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== FLOAT PARAMETER MODIFICATION TEST ===');
    // Load a template with Dropout layer (has float "rate" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Conv for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    console.log('Loaded template: 2D Conv for MNIST');
    // Generate code BEFORE modification
    const downloadPromiseBefore = page.waitForEvent('download', { timeout: 5000 });
    await fileMenu.click();
    await page.waitForTimeout(30);
    let generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
    const downloadBefore = await downloadPromiseBefore;
    const pathBefore = await downloadBefore.path();
    const contentBefore = fs.readFileSync(pathBefore, 'utf-8');
    console.log('Code before modification length:', contentBefore.length);
    // Find and select Dropout layer
    const layersOnCanvas = await page.$$(canvas.layer);
    let dropoutLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      const rightBarText = await page.textContent('#layerOptions');
      if (rightBarText.includes('Dropout') && rightBarText.includes('rate')) {
        console.log('Found and selected Dropout layer');
        dropoutLayerFound = true;
        // Find the range slider for "rate" parameter (Dropout uses range 0-1)
        const rangeInputs = await page.$$('#layeroptions-block input[type="range"]');
        console.log('Range inputs found:', rangeInputs.length);
        expect(rangeInputs.length).toBeGreaterThan(0);
        const initialValue = await rangeInputs[0].inputValue();
        console.log('Initial rate value:', initialValue);
        // Change to 0.75 (this is a slider, so fill works)
        await rangeInputs[0].fill('0.75');
        await rangeInputs[0].dispatchEvent('change');
        await page.waitForTimeout(100); // Wait for Vue reactivity
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
    await page.waitForTimeout(30);
    generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
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
  },
);

e2eOnly(
  'core: should modify string parameter and verify in generated code',
  'Fills the name text input in the rendered right panel after boundingBox node selection and verifies the value lands in a real code download read from disk.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== STRING PARAMETER MODIFICATION TEST ===');
    // Add an Input layer (has string "name" parameter)
    const inputLayer = await page.$('.LayerTemplate:has-text("Input")');
    await inputLayer.click();
    await page.waitForTimeout(100);
    // Click to select the Input layer
    const layerOnCanvas = await page.$(canvas.layer);
    const box = await layerOnCanvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    const rightBarText = await page.textContent('#layerOptions');
    console.log('LayerOptions contains Input:', rightBarText.includes('Input'));
    // Find text input for "name" parameter
    const textInputs = await page.$$('#layeroptions-block input[type="text"]');
    console.log('Text inputs found:', textInputs.length);
    expect(textInputs.length).toBeGreaterThan(0);
    // Find the "name" input (check labels or use the first one)
    const nameInput = textInputs[0];
    const initialValue = await nameInput.inputValue();
    console.log('Initial name value:', initialValue);
    // Set a distinctive name
    await nameInput.fill('test_input_layer');
    await nameInput.dispatchEvent('change');
    await page.waitForTimeout(100);
    const newValue = await nameInput.inputValue();
    console.log('Modified name value to:', newValue);
    expect(newValue).toBe('test_input_layer');
    // Generate code and verify
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains test_input_layer:', content.includes('test_input_layer'));
    expect(content.includes('test_input_layer')).toBe(true);
    console.log('✅ String parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should modify tuple parameter and verify in generated code',
  'Edits the Conv2D kernel_size tuple through the rendered number inputs after boundingBox node selection and verifies the (5,5) value in a real code download read from disk.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== TUPLE PARAMETER MODIFICATION TEST ===');
    // Load template with Conv2D (has tuple "kernel_size" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Conv for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    // Find and select Conv2D layer
    const layersOnCanvas = await page.$$(canvas.layer);
    let conv2dLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      const rightBarText = await page.textContent('#layerOptions');
      if (rightBarText.includes('Conv2D') && rightBarText.includes('kernel_size')) {
        console.log('Found and selected Conv2D layer');
        conv2dLayerFound = true;
        // Find tuple inputs for kernel_size
        // Conv2D has: filters (int), kernel_size (tuple), strides (tuple), etc.
        // So we need to find the right tuple inputs
        const tupleInputs = await page.$$('#layeroptions-block input[type="number"]');
        console.log('Number inputs found:', tupleInputs.length);
        // Log all values to see which ones are kernel_size
        for (let j = 0; j < Math.min(tupleInputs.length, 10); j++) {
          const val = await tupleInputs[j].inputValue();
          console.log(`  Input ${j}: ${val}`);
        }
        // kernel_size is typically the second parameter (after filters)
        // The template has filters=32, kernel_size=(3,3)
        // So indices 1 and 2 should be kernel_size
        expect(tupleInputs.length).toBeGreaterThanOrEqual(3);
        // Change kernel_size (indices 1,2) to (5, 5)
        await tupleInputs[1].fill('5');
        await tupleInputs[1].dispatchEvent('change');
        await page.waitForTimeout(20);
        await tupleInputs[2].fill('5');
        await tupleInputs[2].dispatchEvent('change');
        await page.waitForTimeout(100);
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
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains kernel_size=(5,5):', content.includes('5,5'));
    expect(content.includes('5,5')).toBe(true);
    console.log('✅ Tuple parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should modify list parameter and verify in generated code',
  'Changes the Flatten data_format through the rendered <select> after boundingBox node selection and verifies channels_first appears in a real code download read from disk.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== LIST PARAMETER MODIFICATION TEST ===');
    // Load template with Flatten (has list "data_format" parameter)
    const fileMenu = await page.$('text=File');
    await fileMenu.click();
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    // Find and select Flatten layer
    const layersOnCanvas = await page.$$(canvas.layer);
    let flattenLayerFound = false;
    for (let i = 0; i < layersOnCanvas.length; i++) {
      const layer = layersOnCanvas[i];
      const box = await layer.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(100);
      const rightBarText = await page.textContent('#layerOptions');
      if (rightBarText.includes('Flatten') && rightBarText.includes('data_format')) {
        console.log('Found and selected Flatten layer');
        flattenLayerFound = true;
        // Find select dropdown for data_format
        const selectInputs = await page.$$('#layeroptions-block select');
        console.log('Select inputs found:', selectInputs.length);
        expect(selectInputs.length).toBeGreaterThan(0);
        const initialValue = await selectInputs[0].evaluate(el => el.value);
        console.log('Initial data_format value:', initialValue);
        // Change to channels_first
        await selectInputs[0].selectOption('channels_first');
        await selectInputs[0].dispatchEvent('change');
        await page.waitForTimeout(100);
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
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf-8');
    console.log('Code contains channels_first:', content.includes('channels_first'));
    expect(content.includes('channels_first')).toBe(true);
    console.log('✅ List parameter test passed!');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should delete node, re-add it, set parameters, and reconnect',
  'Full manipulation loop through real input: keyboard deletion of a selected node, catalog re-add, panel form edits, anchor-to-anchor reconnection drags, and a final real code download to prove the parameter stuck.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== NODE MANIPULATION TEST ===');
    // Load a template with multiple connected layers
    await page.click('text=File');
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    // Get initial state
    const initialLayers = await page.$$(canvas.layer);
    const initialEdges = await canvas.edgeCount(page);
    console.log('Initial layers:', initialLayers.length);
    console.log('Initial edges:', initialEdges);
    // Select and delete the first Dense layer (layer 2) - this will isolate the second Dense
    const denseLayer = initialLayers[2];
    const denseBox = await denseLayer.boundingBox();
    await page.mouse.click(denseBox.x + denseBox.width / 2, denseBox.y + denseBox.height / 2);
    await page.waitForTimeout(50);
    // Verify layer is selected
    const isSelected = await denseLayer.evaluate(el => el.classList.contains('selected'));
    console.log('Dense layer selected:', isSelected);
    expect(isSelected).toBe(true);
    // Delete the layer
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    // Verify layer was deleted
    const layersAfterDelete = await page.$$(canvas.layer);
    const edgesAfterDelete = await canvas.edgeCount(page);
    console.log('Layers after deletion:', layersAfterDelete.length);
    console.log('Edges after deletion:', edgesAfterDelete);
    expect(layersAfterDelete.length).toBe(initialLayers.length - 1);
    expect(edgesAfterDelete).toBeLessThan(initialEdges);
    // Re-add a Dense layer
    const denseTemplate = await page.$('.LayerTemplate:has-text("Dense")');
    await denseTemplate.click();
    await page.waitForTimeout(100);
    // Verify layer was added
    const layersAfterAdd = await page.$$(canvas.layer);
    console.log('Layers after re-adding Dense:', layersAfterAdd.length);
    expect(layersAfterAdd.length).toBe(initialLayers.length);
    // Select the newly added layer (last one) and set parameters
    const newDenseLayer = layersAfterAdd[layersAfterAdd.length - 1];
    const newDenseBox = await newDenseLayer.boundingBox();
    await page.mouse.click(newDenseBox.x + newDenseBox.width / 2, newDenseBox.y + newDenseBox.height / 2);
    await page.waitForTimeout(50);
    // Verify LayerOptions shows parameters
    const rightBarText = await page.textContent('#layeroptions-block');
    console.log('LayerOptions shows Dense parameters:', rightBarText.includes('units'));
    expect(rightBarText).toContain('units');
    // Set units parameter to 128
    const unitsInput = await page.$('#layeroptions-block input[type="number"]');
    await unitsInput.fill('128');
    await unitsInput.dispatchEvent('change');
    await page.waitForTimeout(50);
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
    const allLayersAfterAdd = await page.$$(canvas.layer);
    console.log('Total layers after adding:', allLayersAfterAdd.length);
    // Debug: print all layer types to understand the order
    const layerTypes = await canvas.layerLabels(page);
    console.log('Layer order after adding:', layerTypes);
    // Connect Flatten (index 1) to new Dense (index 4)
    await canvas.connect(page, 1, 4);
    await page.waitForTimeout(300);
    console.log('Connected Flatten to new Dense');
    let currentEdges = await canvas.edgeCount(page);
    console.log('Edges after first connection:', currentEdges);
    // Connect new Dense (index 4) to old Dense (index 2)
    await canvas.connect(page, 4, 2);
    await page.waitForTimeout(300);
    console.log('Connected new Dense to old Dense');
    currentEdges = await canvas.edgeCount(page);
    console.log('Edges after second connection:', currentEdges);
    // Verify edges were recreated
    const edgesAfterReconnect = await canvas.edgeCount(page);
    console.log('Edges after reconnection:', edgesAfterReconnect);
    expect(edgesAfterReconnect).toBeGreaterThan(edgesAfterDelete);
    // Verify the parameter was saved by generating code
    const fileMenu = await page.$('text=File');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await fileMenu.click();
    await page.waitForTimeout(30);
    const generateOption = await page.$('text=Generate');
    await generateOption.click();
    await page.waitForTimeout(100);
    const download = await downloadPromise;
    const path = await download.path();
    const content = fs.readFileSync(path, 'utf8');
    console.log('Generated code contains units=128:', content.includes('128'));
    expect(content).toContain('128');
    console.log('✅ Node deleted, re-added, configured, and reconnected successfully!');
  },
);
