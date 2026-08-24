/**
 * Code generation and parameter edits verified through generated code.
 *
 * Converted to DUAL MODE under the exact-same-logic contract: each test keeps
 * its D3-era journey step for step — menu walks, submenu discovery, layer
 * hunt loops, positional panel inputs, download capture around the Export
 * click — with every primitive a dual world-driver verb (menu / downloads /
 * errors / panel / board). Under Playwright the verbs are the original
 * specs' own clicks and selectors; under bun they invoke the function each
 * pixel is bound to (the mounted GeneralMenu's menuTree handlers, the
 * mounted LayerOptions inputs, file-saver's createObjectURL/anchor seam).
 * No residual e2eOnly remains: the browser halves of these tests already
 * ride the REAL download events, filenames and page-error tracking — a
 * separate download-mechanics test would re-assert what every capture
 * here proves.
 */
import { appTest } from '../harness/define';
import { EXPORT_MENU_LABELS } from '../harness/uiLabels';

// Menu entries that are commands, not templates — the template-discovery
// loops skip these (refreshed to the post-G1-split labels).
const UI_COMMANDS = ['New', 'Load', 'Save', 'Projects…', 'Python (Keras)', 'JavaScript (tfjs)', 'PyTorch', 'tinygrad', 'Model (.nnvp)', 'Templates'];

const GOLDEN_JS = `function createModel() {
    const model = tf.sequential();
    model.add(tf.layers.flatten({inputShape:[100,100,],}));
    model.add(tf.layers.dense({}));
    model.add(tf.layers.dense({}));
    return model;
}
`;

const GOLDEN_PYTHON = `import keras

def build_model():
    model = keras.models.Sequential()
    model.add(keras.layers.Flatten(input_shape = (100,100,)))
    model.add(keras.layers.Dense())
    model.add(keras.layers.Dense())
    return model
`;

appTest('core: should generate JavaScript code from manually built network', async ({
  board, menu, downloads, errors, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Add layers by clicking the catalog
  await board.addLayer('Input');
  await board.addLayer('Flatten');
  await board.addLayer('Dense');
  await board.addLayer('Dense'); // Second Dense
  await board.addLayer('Output');
  // Reposition layers vertically so the connect drags have room
  for (let i = 0; i < 5; i++) {
    await board.moveLayer(i, 300, 100 + i * 120);
  }
  // Drag from each layer's output anchor to the next layer to create connections
  for (let i = 0; i < 4; i++) {
    await board.connect(i, i + 1);
    expect(await board.edgeCount()).toBe(i + 1);
  }
  // Listen for the download, then open Export and click Generate JavaScript
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.javascript);
  });
  expect(download).not.toBeNull();
  expect(download!.filename).toContain('.js');
  // Check content against golden master
  expect(download!.content.trim()).toBe(GOLDEN_JS.trim());
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should generate Python code from manually built network', async ({
  board, menu, downloads, errors, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Add layers by clicking the catalog
  await board.addLayer('Input');
  await board.addLayer('Flatten');
  await board.addLayer('Dense');
  await board.addLayer('Dense'); // Second Dense
  await board.addLayer('Output');
  // Reposition layers vertically so the connect drags have room
  for (let i = 0; i < 5; i++) {
    await board.moveLayer(i, 300, 100 + i * 120);
  }
  // Drag to connect layers
  for (let i = 0; i < 4; i++) {
    await board.connect(i, i + 1);
    expect(await board.edgeCount()).toBe(i + 1);
  }
  // Listen for the download, then open Export and click Generate Python
  // (clickItem resolves by exact label — the old spec's textContent check).
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download).not.toBeNull();
  expect(download!.filename).toContain('.py');
  // Check content against golden master
  expect(download!.content.trim()).toBe(GOLDEN_PYTHON.trim());
  expect(await consoleErrors.count()).toBe(0);
});

// CALIBRATION TEST (the exact-same-logic contract): every step of the old
// e2eOnly journey is preserved — open File, hover Templates, enumerate the
// submenu, filter out UI commands, click the first real template, then
// capture the download an Export click triggers. Each primitive is a dual
// menu/downloads/errors driver verb: real pixels under Playwright, the
// mounted GeneralMenu's own label→handler table under bun.
appTest('core: should generate JavaScript code from template', async ({
  menu, downloads, errors, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load a template
  await menu.open('File');
  await menu.hoverSub('Templates');
  const templates = await menu.entries('Templates');
  let templateLoaded = false;
  for (const template of templates) {
    if (!UI_COMMANDS.includes(template.trim())) {
      await menu.clickItem(template.trim());
      templateLoaded = true;
      break;
    }
  }
  expect(templateLoaded).toBe(true);
  // Generate JavaScript code
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.javascript);
  });
  expect(download).not.toBeNull();
  expect(download!.filename).toContain('.js');
  const content = download!.content;
  expect(content.length).toBeGreaterThan(200);
  // JS uses lowercase: tf.layers.dense() or tf.layers.conv2d()
  expect(content.includes('layers.dense') || content.includes('layers.conv')).toBe(true);
  expect(content.includes('tf.')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should generate Python code from template', async ({
  menu, downloads, errors, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load a template
  await menu.open('File');
  await menu.hoverSub('Templates');
  const templates = await menu.entries('Templates');
  let templateLoaded = false;
  for (const template of templates) {
    if (!UI_COMMANDS.includes(template.trim())) {
      await menu.clickItem(template.trim());
      templateLoaded = true;
      break;
    }
  }
  expect(templateLoaded).toBe(true);
  // Generate Python code (clickItem resolves by exact label — the old
  // spec's textContent equality check).
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download).not.toBeNull();
  const content = download!.content;
  expect(content.length).toBeGreaterThan(200);
  expect(content.includes('Dense') || content.includes('Conv')).toBe(true);
  expect(content.includes('keras') || content.includes('tensorflow')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should modify int parameter and verify in generated code', async ({
  board, menu, downloads, errors, panel, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load a template to get a complete connected network
  await menu.open('File');
  await menu.hoverSub('Templates');
  await menu.clickItem('2D Dense for MNIST');
  // Verify we have Dense layers
  const allLayersText = await board.layerLabels();
  expect(allLayersText.some(text => (text ?? '').includes('Dense'))).toBe(true);
  // Generate code BEFORE modification
  const before = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  const contentBefore = before!.content;
  expect(contentBefore.includes('Dense')).toBe(true);
  // Now hunt for the Dense layer and modify its "units" parameter
  let denseLayerFound = false;
  const layerCount = await board.layerCount();
  for (let i = 0; i < layerCount; i++) {
    await board.select(i);
    const rightBarText = await panel.text();
    if (rightBarText.includes('Dense') && rightBarText.includes('units')) {
      denseLayerFound = true;
      expect(await panel.inputCount('number')).toBeGreaterThan(0);
      // Change to a distinctive value: 256
      await panel.setInput('number', 0, '256');
      expect(await panel.inputValue('number', 0)).toBe('256');
      break;
    }
  }
  expect(denseLayerFound).toBe(true);
  // Generate code AFTER modification
  const after = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  const contentAfter = after!.content;
  // Verify the code changed and contains our value
  expect(contentAfter.includes('256')).toBe(true);
  expect(contentBefore !== contentAfter).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should modify float parameter and verify in generated code', async ({
  board, menu, downloads, errors, panel, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load a template with a Dropout layer (has float "rate" parameter)
  await menu.open('File');
  await menu.hoverSub('Templates');
  await menu.clickItem('2D Conv for MNIST');
  // Generate code BEFORE modification
  const before = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  const contentBefore = before!.content;
  // Find and select the Dropout layer
  let dropoutLayerFound = false;
  const layerCount = await board.layerCount();
  for (let i = 0; i < layerCount; i++) {
    await board.select(i);
    const rightBarText = await panel.text();
    if (rightBarText.includes('Dropout') && rightBarText.includes('rate')) {
      dropoutLayerFound = true;
      // The "rate" parameter renders as a range slider (0-1)
      expect(await panel.inputCount('range')).toBeGreaterThan(0);
      // Change to 0.75
      await panel.setInput('range', 0, '0.75');
      expect(await panel.inputValue('range', 0)).toBe('0.75');
      break;
    }
  }
  expect(dropoutLayerFound).toBe(true);
  // Generate code AFTER modification
  const after = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  const contentAfter = after!.content;
  // Verify the parameter change is reflected in the code
  expect(contentBefore.includes('0.75')).toBe(false);
  expect(contentAfter.includes('0.75')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should modify string parameter and verify in generated code', async ({
  board, menu, downloads, errors, panel, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Add an Input layer (has string "name" parameter)
  await board.addLayer('Input');
  // Click to select the Input layer
  await board.select(0);
  const rightBarText = await panel.text();
  expect(rightBarText.includes('Input')).toBe(true);
  // Find the text input for the "name" parameter (the first one)
  expect(await panel.inputCount('text')).toBeGreaterThan(0);
  // Set a distinctive name
  await panel.setInput('text', 0, 'test_input_layer');
  expect(await panel.inputValue('text', 0)).toBe('test_input_layer');
  // Generate code and verify
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download!.content.includes('test_input_layer')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should modify tuple parameter and verify in generated code', async ({
  board, menu, downloads, errors, panel, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load template with Conv2D (has tuple "kernel_size" parameter)
  await menu.open('File');
  await menu.hoverSub('Templates');
  await menu.clickItem('2D Conv for MNIST');
  // Find and select the Conv2D layer
  let conv2dLayerFound = false;
  const layerCount = await board.layerCount();
  for (let i = 0; i < layerCount; i++) {
    await board.select(i);
    const rightBarText = await panel.text();
    if (rightBarText.includes('Conv2D') && rightBarText.includes('kernel_size')) {
      conv2dLayerFound = true;
      // Conv2D has: filters (int), kernel_size (tuple), strides (tuple), …
      // kernel_size is the second parameter (after filters): the template has
      // filters=32, kernel_size=(3,3), so number inputs 1 and 2 are its parts.
      expect(await panel.inputCount('number')).toBeGreaterThanOrEqual(3);
      // Change kernel_size (indices 1,2) to (5, 5)
      await panel.setInput('number', 1, '5');
      await panel.setInput('number', 2, '5');
      expect(await panel.inputValue('number', 1)).toBe('5');
      expect(await panel.inputValue('number', 2)).toBe('5');
      break;
    }
  }
  expect(conv2dLayerFound).toBe(true);
  // Generate code and verify
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download!.content.includes('5,5')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should modify list parameter and verify in generated code', async ({
  board, menu, downloads, errors, panel, expect,
}) => {
  const consoleErrors = await errors.startTracking();
  // Load template with Flatten (has list "data_format" parameter)
  await menu.open('File');
  await menu.hoverSub('Templates');
  await menu.clickItem('2D Dense for MNIST');
  // Find and select the Flatten layer
  let flattenLayerFound = false;
  const layerCount = await board.layerCount();
  for (let i = 0; i < layerCount; i++) {
    await board.select(i);
    const rightBarText = await panel.text();
    if (rightBarText.includes('Flatten') && rightBarText.includes('data_format')) {
      flattenLayerFound = true;
      // Find the select dropdown for data_format
      expect(await panel.selectCount()).toBeGreaterThan(0);
      // Change to channels_first
      await panel.setSelect(0, 'channels_first');
      expect(await panel.selectValue(0)).toBe('channels_first');
      break;
    }
  }
  expect(flattenLayerFound).toBe(true);
  // Generate code and verify
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download!.content.includes('channels_first')).toBe(true);
  expect(await consoleErrors.count()).toBe(0);
});

appTest('core: should delete node, re-add it, set parameters, and reconnect', async ({
  board, menu, downloads, panel, expect,
}) => {
  // Load a template with multiple connected layers
  await menu.open('File');
  await menu.hoverSub('Templates');
  await menu.clickItem('2D Dense for MNIST');
  // Get initial state
  const initialLayers = await board.layerCount();
  const initialEdges = await board.edgeCount();
  // Select and delete the first Dense layer (layer 2) — this isolates the
  // second Dense. (The old spec's isSelected assertion is now board.select's
  // own postcondition: it throws unless the node gains .selected.)
  await board.select(2);
  await board.deleteSelected();
  // Verify layer was deleted
  expect(await board.layerCount()).toBe(initialLayers - 1);
  const edgesAfterDelete = await board.edgeCount();
  expect(edgesAfterDelete).toBeLessThan(initialEdges);
  // Re-add a Dense layer
  await board.addLayer('Dense');
  expect(await board.layerCount()).toBe(initialLayers);
  // Select the newly added layer (last one) and set parameters
  const newIndex = initialLayers - 1;
  await board.select(newIndex);
  // Verify LayerOptions shows parameters
  expect((await panel.text())).toContain('units');
  // Set units parameter to 128
  await panel.setInput('number', 0, '128');
  expect(await panel.inputValue('number', 0)).toBe('128');
  // Reconnect the layers. After deleting the first Dense:
  // Input(0), Flatten(1), Dense(2), Output(3); the new Dense is index 4.
  // Connect Flatten(1) → new Dense(4) → old Dense(2).
  await board.connect(1, newIndex);
  await board.connect(newIndex, 2);
  // Verify edges were recreated
  expect(await board.edgeCount()).toBeGreaterThan(edgesAfterDelete);
  // Verify the parameter was saved by generating code
  const download = await downloads.capture(async () => {
    await menu.open('Export');
    await menu.clickItem(EXPORT_MENU_LABELS.python);
  });
  expect(download!.content).toContain('128');
});

