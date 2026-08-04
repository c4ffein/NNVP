/**
 * Migrated from tests/core-features.spec.js (part 1 of 3 — board/panel/menu
 * behavior; code generation lives in codeGeneration.js, datasets and
 * training in training.js).
 *
 * Most tests here are e2eOnly mechanical wraps: they either probe rendered
 * chrome (right panel, menus, modals), need real input (keyboard deletion,
 * mouse drags, SVG edge hit-testing, downloads/choosers), or preserve the
 * original beforeEach assertion that the browser console stayed clean —
 * which only a live browser can evaluate. The pure graph substance that IS
 * world-expressible (cycle drawing/marking/codegen refusal) runs in both
 * modes as appTest.
 */
import type { ElementHandle, Page } from '@playwright/test';
import { appTest, e2eOnly } from '../harness/define';
import type { CanvasDriver } from '../harness/canvas';
import { edgeInCycle } from '../../src/lib/FlowInterface/adapter';
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import { CyclicGraphError } from '../../src/lib/KerasInterface/orderGraph';
import type { NnvpModel } from '../../src/types/model';

// Replicates the original spec's beforeEach: attach console/pageerror
// collectors, then (re)load the app so load-time errors are captured too —
// the dual runner has already navigated once before the body runs.
async function startErrorTracking(page: Page, canvas: CanvasDriver) {
  const consoleMessages: { type: string; text: string }[] = [];
  const consoleErrors: string[] = [];
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
  'core: should add a layer to canvas by clicking template',
  'The graph substance (adding a layer) is appTest-covered in board.js; this wrap preserves the original assertion that the browser console/pageerror streams stay clean during the real catalog click — only observable in a live browser.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Get initial number of layers on canvas
    const layersBeforeCount = await canvas.layerCount(page);
    console.log('\n=== LAYER PLACEMENT TEST ===');
    console.log('Layers on canvas before:', layersBeforeCount);
    // Find and click a Dense layer template
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    expect(denseLayer).not.toBeNull();
    await denseLayer!.click();
    await page.waitForTimeout(50);
    // Check that a layer was added to the canvas
    const layersAfterCount = await canvas.layerCount(page);
    console.log('Layers on canvas after:', layersAfterCount);
    expect(layersAfterCount).toBe(layersBeforeCount + 1);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should add multiple different layers sequentially',
  'Multi-add substance is appTest-covered in board.js; this wrap preserves the clean browser console/pageerror assertion across the sequential real catalog clicks, which needs a live browser.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Click Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(30);
    const afterFirstLayer = await canvas.layerCount(page);
    // Click Dropout layer (should be in a different category)
    const dropoutLayer = await page.$('.LayerTemplate:has-text("Dropout")');
    await dropoutLayer!.click();
    await page.waitForTimeout(30);
    const afterSecondLayer = await canvas.layerCount(page);
    console.log('\n=== MULTIPLE LAYERS TEST ===');
    console.log('After first layer (Dense):', afterFirstLayer);
    console.log('After second layer (Dropout):', afterSecondLayer);
    expect(afterSecondLayer).toBe(afterFirstLayer + 1);
    expect(afterSecondLayer).toBeGreaterThanOrEqual(2);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should load a template from File menu',
  'Walks the real File > Templates submenu DOM (hover-opened nested dropdown) to discover and click a template entry, and asserts a clean browser console — menu chrome traversal only exists in the rendered UI.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Open File menu
    const fileMenu = await page.$('text=File');
    await fileMenu!.click();
    await page.waitForTimeout(50);
    // Check if Templates submenu exists
    const templatesOption = await page.$('text=Templates');
    console.log('\n=== TEMPLATE LOADING TEST ===');
    console.log('Templates menu available:', templatesOption !== null);
    if (templatesOption) {
      // Hover to open Templates submenu
      await templatesOption.hover();
      await page.waitForTimeout(50);
      // Get the templates from the nested dropdown under Templates menuItem
      // The structure is: .menuItem (Templates) > .dropdown-content > .menuItem (actual templates)
      const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
      console.log('Number of templates found:', templates.length);
      // If templates exist, find one that's a real template (not a UI command)
      if (templates.length > 0) {
        let templateToLoad: ElementHandle<SVGElement | HTMLElement> | null = null;
        let templateName: string | null = '';
        // UI commands to skip
        const uiCommands = ['New', 'Load', 'Save', 'Generate TF - Python', 'Generate TF - JavaScript', 'Generate PyTorch', 'Generate Tinygrad', 'Templates', 'Undo', 'Redo'];
        for (const template of templates) {
          const text = await template.textContent();
          const trimmed = text!.trim();
          if (!uiCommands.includes(trimmed)) {
            templateToLoad = template;
            templateName = trimmed;
            break;
          }
        }
        // Fallback to first template if all are UI commands (unlikely)
        if (!templateToLoad) {
          templateToLoad = templates[0]!;
          templateName = await templateToLoad.textContent();
        }
        console.log('Loading template:', templateName);
        await templateToLoad.click();
        // Wait longer for template to load and render
        await page.waitForTimeout(100);
        // Count plain and composite layers on the board
        const plainLayers = await canvas.layerCount(page);
        const compositeLayers = await canvas.compositeCount(page);
        const totalLayers = plainLayers + compositeLayers;
        console.log('layer count:', plainLayers);
        console.log('composite count:', compositeLayers);
        console.log('Total layers on canvas after template load:', totalLayers);
        expect(totalLayers).toBeGreaterThan(0);
        // Verify layer types in the loaded template
        const layerTexts = await canvas.layerLabels(page);
        console.log('Layer types:', layerTexts);
        // Template should have Input and Output layers
        expect(layerTexts.some(text => text!.includes('Input'))).toBe(true);
        expect(layerTexts.some(text => text!.includes('Output'))).toBe(true);
        // Should have at least one processing layer (Dense, Conv, etc.)
        const hasProcessingLayer = layerTexts.some(text =>
          text!.includes('Dense') || text!.includes('Conv') || text!.includes('Flatten')
        );
        expect(hasProcessingLayer).toBe(true);
        // Verify edges/connections exist
        const edges = await canvas.edgeCount(page);
        console.log('Number of edges:', edges);
        expect(edges).toBeGreaterThan(0);
      }
    }
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should select a layer and show parameters in LayerOptions',
  'Asserts the right-panel #layerOptions DOM content after selecting the node with a force click — rendered panel chrome plus the clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    // Click on the layer in the canvas to select it
    const layerOnCanvas = await page.$(canvas.layer);
    await layerOnCanvas!.click({ force: true });
    await page.waitForTimeout(50);
    // Check if LayerOptions shows parameters
    const rightBarContent = (await page.textContent('#layerOptions'))!;
    const rightbarBlock = await page.$('#layeroptions-block');
    const isLayerSelected = await layerOnCanvas!.evaluate(el => el.classList.contains('selected'));
    console.log('\n=== PARAMETER DISPLAY TEST ===');
    console.log('Layer is selected:', isLayerSelected);
    console.log('LayerOptions has content:', rightBarContent.length > 0);
    console.log('LayerOptions text (first 100 chars):', rightBarContent.substring(0, 100));
    console.log('layeroptions-block exists:', rightbarBlock !== null);
    console.log('LayerOptions contains "units":', rightBarContent.includes('units'));
    console.log('LayerOptions contains "No layers selected":', rightBarContent.includes('No layers selected'));
    expect(rightBarContent.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should return the right panel to empty selection when deselecting a layer',
  "Deselects by clicking empty-canvas coordinates computed from the node's boundingBox (hit-testing clear of the floating panels) and asserts the right panel swaps between params block and Network Overview DOM.",
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a Dense layer and select it
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const layerOnCanvas = await page.$(canvas.layer);
    await layerOnCanvas!.click({ force: true });
    await page.waitForTimeout(50);

    // While selected: the params block is shown and the empty "Network Overview" is not
    const selectedBefore = await layerOnCanvas!.evaluate(el => el.classList.contains('selected'));
    const blockBefore = await page.$('#layeroptions-block');
    const overviewBefore = await page.$('.network-stats');
    console.log('\n=== DESELECT TEST ===');
    console.log('selected before deselect:', selectedBefore);
    console.log('params block shown before:', blockBefore !== null);
    console.log('overview shown before:', overviewBefore !== null);
    expect(selectedBefore).toBe(true);
    expect(blockBefore).not.toBeNull();
    expect(overviewBefore).toBeNull();

    // Deselect by clicking empty canvas below the node — clear of the floating
    // side/top panels (which would otherwise intercept the click).
    const nodeBox = (await layerOnCanvas!.boundingBox())!;
    await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height + 200);
    await page.waitForTimeout(50);

    // The right panel must return to the empty selection state (Network Overview)
    const selectedAfter = await layerOnCanvas!.evaluate(el => el.classList.contains('selected'));
    const blockAfter = await page.$('#layeroptions-block');
    const overviewAfter = await page.$('.network-stats');
    console.log('selected after deselect:', selectedAfter);
    console.log('params block shown after:', blockAfter !== null);
    console.log('overview shown after:', overviewAfter !== null);
    expect(selectedAfter).toBe(false);
    expect(blockAfter).toBeNull();
    expect(overviewAfter).not.toBeNull();
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should support undo operations',
  'Undo substance is appTest-covered in board.js; this wrap drives undo through the real Edit dropdown menu chrome and preserves the clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add two layers
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(30);
    await denseLayer!.click();
    await page.waitForTimeout(30);
    const layersAfterAdd = await canvas.layerCount(page);
    console.log('\n=== UNDO TEST ===');
    console.log('Layers after adding 2:', layersAfterAdd);
    // Click Edit menu -> Undo
    const editMenu = await page.$('text=Edit');
    await editMenu!.click();
    await page.waitForTimeout(30);
    const undoOption = await page.$('text=Undo');
    await undoOption!.click();
    await page.waitForTimeout(50);
    const layersAfterUndo1 = await canvas.layerCount(page);
    console.log('Layers after first undo:', layersAfterUndo1);
    // Undo again
    await editMenu!.click();
    await page.waitForTimeout(30);
    const undoOption2 = await page.$('text=Undo');
    await undoOption2!.click();
    await page.waitForTimeout(50);
    const layersAfterUndo2 = await canvas.layerCount(page);
    console.log('Layers after second undo:', layersAfterUndo2);
    expect(layersAfterUndo2).toBeLessThan(layersAfterAdd);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should modify boolean parameter by clicking',
  'Toggles a boolean parameter <select> in the rendered right-panel form with a real click and reads the DOM value back, plus the clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a Dense layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    // Click layer to select it
    const layerOnCanvas = await page.$(canvas.layer);
    await layerOnCanvas!.click({ force: true });
    await page.waitForTimeout(100); // Wait longer for reactive update
    // Check if layeroptions-block is visible
    const rightbarBlock = await page.$('#layeroptions-block');
    console.log('\n=== BOOLEAN PARAMETER MODIFICATION TEST ===');
    console.log('Rightbar block visible:', rightbarBlock !== null);
    // layeroptions-block MUST exist when a layer is selected
    expect(rightbarBlock).not.toBeNull();
    // Find boolean parameter selects
    const booleanSelects = await page.$$('#layeroptions-block select.parameter-boolean');
    console.log('Boolean parameters found:', booleanSelects.length);
    // Dense layer MUST have boolean parameters
    expect(booleanSelects.length).toBeGreaterThan(0);
    const initialValue = await booleanSelects[0]!.evaluate(el => (el as HTMLSelectElement).value);
    console.log('Initial value:', initialValue);
    // Click to toggle
    await booleanSelects[0]!.click();
    await page.waitForTimeout(50);
    const newValue = await booleanSelects[0]!.evaluate(el => (el as HTMLSelectElement).value);
    console.log('Value after click:', newValue);
    expect(newValue).not.toBe('void');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should delete a layer using Backspace key',
  "Presses the physical Backspace key against the focused board and asserts the node carries the 'selected' CSS class after a boundingBox mouse click — real keyboard dispatch and hit-testing, plus a clean-console assertion.",
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const layersBeforeDelete = await canvas.layerCount(page);
    // Click on the layer using force to bypass the text element
    const layerElement = await page.$(canvas.layer);
    const box = (await layerElement!.boundingBox())!;
    // Click in the center of the layer
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);
    // Check if layer is selected (has 'selected' class)
    const isSelected = await layerElement!.evaluate(el => el.classList.contains('selected'));
    console.log('\n=== LAYER DELETION TEST (BACKSPACE) ===');
    console.log('Layers before delete:', layersBeforeDelete);
    console.log('Layer is selected:', isSelected);
    expect(isSelected).toBe(true);
    // Delete with Backspace
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50);
    const layersAfterDelete = await canvas.layerCount(page);
    console.log('Layers after Backspace:', layersAfterDelete);
    expect(layersAfterDelete).toBe(layersBeforeDelete - 1);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should delete a layer using Delete key',
  "Presses the physical Delete key against the focused board (the Backspace variant is covered separately) and asserts the 'selected' class — real keyboard dispatch, plus a clean-console assertion.",
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const layersBeforeDelete = await canvas.layerCount(page);
    // Click on the layer using force to bypass the text element
    const layerElement = await page.$(canvas.layer);
    const box = (await layerElement!.boundingBox())!;
    // Click in the center of the layer
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);
    // Check if layer is selected (has 'selected' class)
    const isSelected = await layerElement!.evaluate(el => el.classList.contains('selected'));
    console.log('\n=== LAYER DELETION TEST (DELETE) ===');
    console.log('Layers before delete:', layersBeforeDelete);
    console.log('Layer is selected:', isSelected);
    expect(isSelected).toBe(true);
    // Delete with Delete key
    await page.keyboard.press('Delete');
    await page.waitForTimeout(50);
    const layersAfterDelete = await canvas.layerCount(page);
    console.log('Layers after Delete:', layersAfterDelete);
    expect(layersAfterDelete).toBe(layersBeforeDelete - 1);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should update LayerOptions panel after deleting a layer',
  "Asserts the right-panel DOM no longer shows the deleted layer's parameters after keyboard deletion — panel chrome state driven by real selection clicks.",
  async ({ page, canvas, expect }) => {
    console.log('\n=== LAYER OPTIONS UPDATE ON DELETE TEST ===');
    // Add two different layers
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const dropoutLayer = await page.$('.LayerTemplate:has-text("Dropout")');
    await dropoutLayer!.click();
    await page.waitForTimeout(50);
    const layersCount = await canvas.layerCount(page);
    console.log('Total layers:', layersCount);
    expect(layersCount).toBe(2);
    // Select the first layer
    const firstLayer = await page.$(canvas.layer);
    const box = (await firstLayer!.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(50);
    // Check what LayerOptions shows (could be Dense or Dropout depending on layer order)
    const layerOptionsBeforeDelete = (await page.textContent('#layerOptions'))!;
    console.log('LayerOptions before delete (first 100 chars):', layerOptionsBeforeDelete.substring(0, 100));
    // Identify which layer is selected by checking the parameters shown
    const isDenseSelected = layerOptionsBeforeDelete.includes('Dense') && layerOptionsBeforeDelete.includes('units');
    const isDropoutSelected = layerOptionsBeforeDelete.includes('Dropout') && layerOptionsBeforeDelete.includes('rate');
    console.log('Dense selected:', isDenseSelected);
    console.log('Dropout selected:', isDropoutSelected);
    // One of them should be selected
    expect(isDenseSelected || isDropoutSelected).toBe(true);
    const selectedLayerName = isDenseSelected ? 'Dense' : 'Dropout';
    const selectedLayerParam = isDenseSelected ? 'units' : 'rate';
    console.log('Selected layer:', selectedLayerName);
    // Delete the layer
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(50);
    const layersAfterDelete = await canvas.layerCount(page);
    console.log('Layers after delete:', layersAfterDelete);
    expect(layersAfterDelete).toBe(1);
    // Check LayerOptions after delete - should either show "No layers selected" or the other layer
    const layerOptionsAfterDelete = (await page.textContent('#layerOptions'))!;
    console.log('LayerOptions after delete (first 100 chars):', layerOptionsAfterDelete.substring(0, 100));
    // It should NOT still show the deleted layer's parameters
    const stillShowsDeletedLayer = layerOptionsAfterDelete.includes(selectedLayerName) &&
                                    layerOptionsAfterDelete.includes(selectedLayerParam);
    console.log(`LayerOptions still shows deleted ${selectedLayerName} layer:`, stillShowsDeletedLayer);
    // Should either show "Network Overview" (default when nothing selected) or the other layer
    const showsNetworkOverview = layerOptionsAfterDelete.includes('Network Overview');
    const otherLayerName = selectedLayerName === 'Dense' ? 'Dropout' : 'Dense';
    const showsOtherLayer = layerOptionsAfterDelete.includes(otherLayerName);
    console.log('Shows "Network Overview":', showsNetworkOverview);
    console.log(`Shows other layer (${otherLayerName}):`, showsOtherLayer);
    // THIS IS THE BUG: LayerOptions should update after deletion
    expect(stillShowsDeletedLayer).toBe(false);
    expect(showsNetworkOverview || showsOtherLayer).toBe(true);
  },
);

e2eOnly(
  'core: should show correct LayerOptions info through comprehensive workflow states',
  'Reads the #layerOptions panel text through a nine-step workflow (select/deselect/delete/undo/redo/template) including empty-canvas deselect clicks — rendered panel chrome plus coordinate hit-testing throughout.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== COMPREHENSIVE LAYER OPTIONS TEST ===');
    // 1. Empty board - should show Network Overview
    let layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(/Layers\s*0/);
    expect(layerOptions).toMatch(/Inputs\s*0/);
    expect(layerOptions).toMatch(/Outputs\s*0/);
    expect(layerOptions).toMatch(/Connections\s*0/);
    console.log('✓ Step 1: Empty board shows Network Overview with all 0s');
    // 2. After adding a layer - should show layer parameters
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(10);
    // Click on the layer to select it
    const firstLayerNode = await page.$(canvas.layer);
    const box = (await firstLayerNode!.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(10);
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Dense');
    expect(layerOptions).toContain('units');
    console.log('✓ Step 2: After adding layer shows Dense layer parameters');
    // 2b. Deselect the layer and verify Network Overview appears
    // Click on empty space to deselect
    await canvas.deselect(page);
    await page.waitForTimeout(10);
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(/Layers\s*1/); // 1 layer
    expect(layerOptions).toMatch(/Connections\s*0/); // 0 connections
    console.log('✓ Step 2b: After deselecting shows Network Overview with 1 layer, 0 connections');
    // 3. After deleting the layer - should show Network Overview
    // Select layer again before deleting
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(10);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(10);
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(/Layers\s*0/); // 0 layers
    expect(layerOptions).toMatch(/Connections\s*0/); // 0 connections
    console.log('✓ Step 3: After deleting layer shows Network Overview with 0 layers');
    // 4. After loading a template - should show appropriate info
    const fileMenu = await page.$('text=File');
    await fileMenu!.click();
    await page.waitForTimeout(10);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu!.hover();
    await page.waitForTimeout(10);
    const mnistTemplate = await page.$('text=MNIST');
    await mnistTemplate!.click();
    await page.waitForTimeout(10);
    // Should have loaded multiple layers
    const layersCount = await canvas.layerCount(page);
    expect(layersCount).toBeGreaterThan(0);
    // Count edges to verify connections
    const edgesCount = await canvas.edgeCount(page);
    // Get Network Overview to verify numbers
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(new RegExp(`Layers\\s*${layersCount}`));
    expect(layerOptions).toMatch(new RegExp(`Connections\\s*${edgesCount}`));
    console.log(`✓ Step 4: After loading template, ${layersCount} layers, ${edgesCount} connections verified`);
    // 5. After deleting a node - should update correctly
    // Click on the first layer to select it
    const templateLayer = await page.$(canvas.layer);
    const templateBox = (await templateLayer!.boundingBox())!;
    await page.mouse.click(templateBox.x + templateBox.width / 2, templateBox.y + templateBox.height / 2);
    await page.waitForTimeout(10);
    layerOptions = (await page.textContent('#layerOptions'))!;
    // Just verify that we're showing layer info (not Network Overview)
    const showsLayerInfo = !layerOptions.includes('Network Overview');
    expect(showsLayerInfo).toBe(true);
    console.log('Selected layer - LayerOptions showing layer parameters');
    // Delete the selected node
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(10);
    const layersAfterDelete = await canvas.layerCount(page);
    expect(layersAfterDelete).toBe(layersCount - 1);
    layerOptions = (await page.textContent('#layerOptions'))!;
    // Should show Network Overview since nothing is selected after deletion
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(new RegExp(`Layers\\s*${layersAfterDelete}`));
    // Just verify connections are shown (actual count depends on template structure)
    expect(layerOptions).toMatch(/Connections\s*\d+/);
    console.log(`✓ Step 5: After deleting node shows Network Overview with ${layersAfterDelete} layers`);
    // 6. After undoing - deleted layer should be restored
    const editMenu = await page.$('text=Edit');
    await editMenu!.click();
    await page.waitForTimeout(10);
    const undoOption = await page.$('text=Undo');
    await undoOption!.click();
    await page.waitForTimeout(50);
    let layersAfterUndo = await canvas.layerCount(page);
    expect(layersAfterUndo).toBe(layersCount);
    console.log('✓ Step 6: After undoing, deleted layer restored');
    // 7. After redoing - layer should be deleted again
    await editMenu!.click();
    await page.waitForTimeout(10);
    const redoOption = await page.$('text=Redo');
    await redoOption!.click();
    await page.waitForTimeout(50);
    const layersAfterRedo = await canvas.layerCount(page);
    expect(layersAfterRedo).toBe(layersCount - 1);
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(new RegExp(`Layers\\s*${layersAfterRedo}`));
    expect(layerOptions).toMatch(/Connections\s*\d+/);
    console.log(`✓ Step 7: After redoing, layer deleted again, Network Overview shows ${layersAfterRedo} layers`);
    // 8. After deleting a node again
    // Select and delete a layer (we should have layersCount-1 after the redo)
    const layerToDelete = await page.$(canvas.layer);
    const deleteBox = (await layerToDelete!.boundingBox())!;
    await page.mouse.click(deleteBox.x + deleteBox.width / 2, deleteBox.y + deleteBox.height / 2);
    await page.waitForTimeout(10);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(10);
    const layersAfterSecondDelete = await canvas.layerCount(page);
    expect(layersAfterSecondDelete).toBe(layersCount - 2);
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(new RegExp(`Layers\\s*${layersAfterSecondDelete}`));
    expect(layerOptions).toMatch(/Connections\s*\d+/);
    console.log(`✓ Step 8: After deleting node again, Network Overview shows ${layersAfterSecondDelete} layers`);
    // 9. After re-adding the node manually - should show new layer when selected
    const dropoutLayer = await page.$('.LayerTemplate:has-text("Dropout")');
    await dropoutLayer!.click();
    await page.waitForTimeout(100);  // Longer wait for layer to be added and positioned
    // Click on the newly added layer to select it
    const newLayer = await page.$$(canvas.layer);
    const lastLayer = newLayer[newLayer.length - 1]!;
    const newBox = (await lastLayer.boundingBox())!;
    await page.mouse.click(newBox.x + newBox.width / 2, newBox.y + newBox.height / 2);
    await page.waitForTimeout(100);  // Longer wait for selection to register
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Dropout');
    expect(layerOptions).toContain('rate');
    console.log('✓ Step 9: After re-adding node manually, shows Dropout layer parameters');
    // 9b. Final Network Overview verification - deselect and check all numbers
    // Click an empty canvas spot to deselect
    await canvas.deselect(page);
    await page.waitForTimeout(50);
    const finalLayersCount = await canvas.layerCount(page);
    expect(finalLayersCount).toBe(layersCount - 1); // One less than template (deleted 2, added 1 back)
    layerOptions = (await page.textContent('#layerOptions'))!;
    expect(layerOptions).toContain('Network Overview');
    expect(layerOptions).toMatch(new RegExp(`Layers\\s*${finalLayersCount}`));
    expect(layerOptions).toMatch(/Inputs\s*\d+/);
    expect(layerOptions).toMatch(/Outputs\s*\d+/);
    expect(layerOptions).toMatch(/Connections\s*\d+/);
    console.log(`✓ Step 9b: Final Network Overview verified - ${finalLayersCount} layers with proper inputs/outputs/connections`);
    console.log('=== COMPREHENSIVE LAYER OPTIONS TEST PASSED ===\n');
  },
);

e2eOnly(
  'core: should test REDO functionality',
  'Redo substance is appTest-covered in board.js; this wrap drives undo/redo through the real Edit dropdown menu chrome and preserves the clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Add a layer
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const layersAfterAdd = await canvas.layerCount(page);
    console.log('\n=== REDO TEST ===');
    console.log('Layers after adding:', layersAfterAdd);
    // Undo
    const editMenu = await page.$('text=Edit');
    await editMenu!.click();
    await page.waitForTimeout(50);
    const undoOption = await page.$('text=Undo');
    await undoOption!.click();
    await page.waitForTimeout(100);
    const layersAfterUndo = await canvas.layerCount(page);
    console.log('Layers after undo:', layersAfterUndo);
    // Redo
    await editMenu!.click();
    await page.waitForTimeout(50);
    const redoOption = await page.$('text=Redo');
    await redoOption!.click();
    await page.waitForTimeout(100);
    const layersAfterRedo = await canvas.layerCount(page);
    console.log('Layers after redo:', layersAfterRedo);
    expect(layersAfterRedo).toBe(layersAfterAdd);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'core: should delete edge and verify layers become isolated',
  'Selects an edge by walking the rendered SVG path (getPointAtLength + elementFromPoint hit-testing) before deleting it with the physical Backspace key — layout-dependent geometry only a browser computes.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== EDGE DELETION TEST ===');
    // Load a template with connected layers
    await page.click('text=File');
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption!.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template!.click();
    await page.waitForTimeout(100);
    // Count initial edges
    const initialEdges = await canvas.edgeCount(page);
    console.log('Initial edges:', initialEdges);
    expect(initialEdges).toBeGreaterThan(0);
    // Click on an edge to select it (try the first edge)
    await canvas.selectFirstEdge(page);
    await page.waitForTimeout(50);
    // Verify edge is selected
    const selectedEdge = await page.$(canvas.selectedEdge);
    expect(selectedEdge).not.toBeNull();
    console.log('Edge selected:', await selectedEdge!.evaluate(el => el.id));
    // Press Backspace key to delete the edge (alternative to Delete)
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    // Count edges after deletion
    const edgesAfter = await canvas.edgeCount(page);
    console.log('Edges after deletion:', edgesAfter);
    expect(edgesAfter).toBe(initialEdges - 1);
    console.log('✅ Edge deleted!');
  },
);

e2eOnly(
  'core: should redraw deleted edge and verify network is valid again',
  'Combines SVG-path edge hit-testing (getPointAtLength + elementFromPoint), physical keyboard deletion, and a real anchor-to-anchor mouse drag to recreate the connection — pointer gestures over computed layout.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== EDGE RECREATION TEST ===');
    // Load a template with connected layers
    await page.click('text=File');
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption!.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template!.click();
    await page.waitForTimeout(100);
    // Get all layers to identify source and target for reconnection
    const layers = await page.$$(canvas.layer);
    console.log('Total layers:', layers.length);
    // Count initial edges
    const initialEdges = await canvas.edgeCount(page);
    console.log('Initial edges:', initialEdges);
    // Select and delete first edge (the first edge is s0_t1: layer 0 -> layer 1)
    await canvas.selectFirstEdge(page);
    await page.waitForTimeout(50);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    // Verify edge was deleted
    const edgesAfterDelete = await canvas.edgeCount(page);
    expect(edgesAfterDelete).toBe(initialEdges - 1);
    // Redraw the edge by dragging from anchor to anchor
    console.log('Reconnecting layers by drag-and-drop...');
    await canvas.connect(page, 0, 1);
    await page.waitForTimeout(300);
    // Count edges after reconnection
    const edgesAfterReconnect = await canvas.edgeCount(page);
    console.log('Edges after reconnection:', edgesAfterReconnect);
    expect(edgesAfterReconnect).toBe(initialEdges);
    console.log('✅ Edge recreated and network is valid again!');
  },
);

e2eOnly(
  'core: should create edge by dragging from handle to handle (verify drag still works)',
  'The stated purpose is that REAL pointer gestures still work: dragging a node with mouse.down/move/up and dragging a connection between anchors — physical drags that only a browser can perform.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== DRAG-TO-CONNECT TEST (VERIFY NOT BROKEN) ===');
    // Add two layers
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer!.click();
    await page.waitForTimeout(50);
    await denseLayer!.click();
    await page.waitForTimeout(50);
    const layers = await page.$$(canvas.layer);
    console.log('Added layers:', layers.length);
    expect(layers.length).toBe(2);
    // Move second layer to avoid overlap (drag it down with the mouse — this
    // also verifies node dragging still works on the board)
    const layer1Box = (await page.locator(canvas.layer).nth(1).boundingBox())!;
    await page.mouse.move(layer1Box.x + layer1Box.width / 2, layer1Box.y + layer1Box.height / 2);
    await page.mouse.down();
    await page.mouse.move(layer1Box.x + layer1Box.width / 2, layer1Box.y + layer1Box.height / 2 + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    // Get initial edge count
    const edgesBefore = await canvas.edgeCount(page);
    console.log('Edges before drag:', edgesBefore);
    // Drag from first layer's output anchor to second layer
    console.log('Dragging from layer 0 output anchor to layer 1...');
    await canvas.connect(page, 0, 1);
    await page.waitForTimeout(300);
    // Verify edge was created
    const edgesAfter = await canvas.edgeCount(page);
    console.log('Edges after drag:', edgesAfter);
    expect(edgesAfter).toBe(edgesBefore + 1);
    console.log('✅ Drag-to-connect still works correctly!');
  },
);

e2eOnly(
  'core: should open About modal and display content',
  'Exercises the About modal as UI: content, close via X, Esc and overlay-coordinate clicks, each waiting out the ~1s close animation — modal chrome, keyboard and boundingBox hit-testing.',
  async ({ page, expect }) => {
    console.log('\n=== ABOUT MODAL TEST ===');
    // About is its own modal, opened by the ? button at the far right of the
    // top bar.
    const aboutMenu = await page.$('[aria-label="About NNVP"]');
    expect(aboutMenu).not.toBeNull();
    console.log('Clicking the corner ? button...');
    await aboutMenu!.click();
    await page.waitForTimeout(50);
    // Verify modal is visible
    const modal = await page.$('.modal-overlay');
    expect(modal).not.toBeNull();
    const isVisible = await modal!.isVisible();
    console.log('Modal visible:', isVisible);
    expect(isVisible).toBe(true);
    // Verify modal contains key content
    const modalContent = await page.textContent('.modal-container');
    console.log('Checking modal content...');
    expect(modalContent).toContain('NNVP');
    expect(modalContent).toContain('Neural Network Visual Programming');
    expect(modalContent).toContain('Keras');
    expect(modalContent).toContain('Open Source');
    expect(modalContent).toContain('GitHub');
    console.log('✅ Modal content verified');
    // Test closing with X button
    const closeButton = await page.$('.modal-close');
    expect(closeButton).not.toBeNull();
    console.log('Clicking close button...');
    await closeButton!.click();
    // close animation
    await page.waitForTimeout(1000);
    // Verify modal is closed
    const modalAfterClose = await page.$('.modal-overlay');
    const isVisibleAfterClose = modalAfterClose ? await modalAfterClose.isVisible() : false;
    console.log('Modal visible after close:', isVisibleAfterClose);
    expect(isVisibleAfterClose).toBe(false);
    // Test opening again and closing with ESC
    console.log('Testing ESC key close...');
    await aboutMenu!.click();
    await page.waitForTimeout(1000);
    const modalReopened = await page.$('.modal-overlay');
    expect(await modalReopened!.isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    const modalAfterEsc = await page.$('.modal-overlay');
    const isVisibleAfterEsc = modalAfterEsc ? await modalAfterEsc.isVisible() : false;
    console.log('Modal visible after ESC:', isVisibleAfterEsc);
    expect(isVisibleAfterEsc).toBe(false);
    // Test closing by clicking overlay
    console.log('Testing overlay click close...');
    await aboutMenu!.click();
    await page.waitForTimeout(1000);
    const overlayReopened = await page.$('.modal-overlay');
    expect(await overlayReopened!.isVisible()).toBe(true);
    // Click on the overlay (not the modal container)
    const overlayBox = (await overlayReopened!.boundingBox())!;
    await page.mouse.click(overlayBox.x + 10, overlayBox.y + 10);
    await page.waitForTimeout(1000);
    const modalAfterOverlayClick = await page.$('.modal-overlay');
    const isVisibleAfterOverlay = modalAfterOverlayClick ? await modalAfterOverlayClick.isVisible() : false;
    console.log('Modal visible after overlay click:', isVisibleAfterOverlay);
    expect(isVisibleAfterOverlay).toBe(false);
    console.log('✅ About modal works correctly!');
  },
);

// Substance is pure graph behavior (the board's isValidConnection contract),
// so this one runs in BOTH modes through the world surface; under the browser
// runner the connections are real anchor drags. Spec changed in Phase D
// (PLAN decision 9): the board no longer REFUSES a cycle-closing edge — the
// edge is created, every edge on the loop gets the red edgeInCycle marking,
// and code generation refuses the cyclic graph with a typed CyclicGraphError
// instead of silently truncating.
appTest('core: allows drawing a cycle edge, marks the loop, and codegen refuses it explicitly', async ({ board, expect }) => {
  console.log('\n=== CYCLE HANDLING TEST ===');
  // Step 1: Create a simple valid DAG first (no cycle)
  console.log('Step 1: Creating valid DAG (A -> B -> C)');
  // Add 3 layers
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  expect(await board.layerCount()).toBe(3);
  console.log('✓ Added 3 layers');
  // Position layers in a vertical line to make connections easier
  // (layer ids are creation order 0..n)
  for (let i = 0; i < 3; i++) {
    await board.moveLayer(i, 400, 200 + (i * 150));
  }
  console.log('✓ Positioned layers vertically');
  // Connect layer 0 -> layer 1, then layer 1 -> layer 2
  await board.connect(0, 1);
  await board.connect(1, 2);
  expect(await board.edgeCount()).toBe(2);
  console.log('✓ Created 2 edges in valid DAG');
  // Step 2: Close the cycle by connecting layer 2 back to layer 0 — the
  // edge is CREATED now (Phase D re-enabled drawing cycles).
  console.log('Step 2: Closing the cycle by connecting C -> A');
  await board.connect(2, 0);
  expect(await board.edgeCount()).toBe(3);
  console.log('✓ Cycle-closing connection was created (edge count 3)');
  // Step 3: every edge of the loop is flagged by the same live derived query
  // FloatingEdge.vue renders red.
  const json = await board.graphJSON();
  const model = JSON.parse(json) as NnvpModel;
  const ends = model.edges.map(edge => ({
    source: String(edge.source), target: String(edge.target),
  }));
  expect(ends.length).toBe(3);
  ends.forEach(edge => expect(edgeInCycle(ends, edge)).toBe(true));
  console.log('✓ All three loop edges are marked cyclic');
  // Step 4: codegen refuses the cyclic graph with the typed error — never a
  // silently truncated model. (KerasGenerator mutates its input: fresh parse.)
  let error: unknown;
  try {
    new KerasGenerator(JSON.parse(json) as NnvpModel, true).generateJavascriptFromGraph();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(CyclicGraphError);
  console.log('✓ Code generation threw CyclicGraphError');
  console.log('✅ CYCLE HANDLING TEST PASSED');
});

e2eOnly(
  'core: should save graph to file, clear with NEW, and load from file',
  'Round-trips the model through a real browser download (Save to this device) and a filechooser upload (Load from this device) with a confirm dialog on File > New — downloads, choosers and dialogs exist only under the browser runner.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== SAVE/LOAD FILE TEST ===');
    // Step 1: Load a template to get some content
    console.log('Step 1: Loading a template to get initial content...');
    const fileMenu = await page.$('text=File');
    await fileMenu!.click();
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    expect(templatesOption).not.toBeNull();
    await templatesOption!.hover();
    await page.waitForTimeout(50);
    // Get first available template
    const templates = await page.$$('.menuItem:has-text("Templates") > .dropdown-content > .menuItem');
    expect(templates.length).toBeGreaterThan(0);
    const firstTemplate = templates[0]!;
    const templateName = await firstTemplate.textContent();
    console.log(`Loading template: "${templateName}"`);
    await firstTemplate.click();
    await page.waitForTimeout(150);
    // Step 2: Verify graph has content
    console.log('Step 2: Verifying graph has content...');
    const initialLayerCount = await canvas.layerCount(page);
    const initialEdgeCount = await canvas.edgeCount(page);
    console.log(`Layers after template load: ${initialLayerCount}`);
    console.log(`Edges after template load: ${initialEdgeCount}`);
    expect(initialLayerCount).toBeGreaterThan(0);
    // Get layer names for verification
    const initialLayerNames = await canvas.layerLabels(page);
    console.log('Initial layer types:', initialLayerNames);
    // Step 3: Save the graph to a file
    console.log('Step 3: Saving graph to file...');
    const fileMenu2 = await page.$('text=File');
    await fileMenu2!.click();
    await page.waitForTimeout(50);
    // Phase G2: File > Save is a checkpoint now; the device download lives in
    // File > Projects… (the cloud-aware modal's device path).
    const saveOption = await page.$('text=Projects…');
    expect(saveOption).not.toBeNull();
    await saveOption!.click();
    await page.waitForTimeout(100);
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Save to this device")');
    // Wait for download and save to buffer
    const download = await downloadPromise;
    const downloadPath = await download.path();
    console.log(`Graph saved to: ${downloadPath}`);
    expect(downloadPath).not.toBeNull();
    // Step 4: Click File > New to clear the board
    // (The original accepted the confirmation with a page.once dialog
    // handler; the dual runner's global handler already auto-accepts it.)
    console.log('Step 4: Clearing board with File > New...');
    const fileMenu3 = await page.$('text=File');
    await fileMenu3!.click();
    await page.waitForTimeout(50);
    const newOption = await page.$('text=New');
    expect(newOption).not.toBeNull();
    await newOption!.click();
    await page.waitForTimeout(150);
    // Step 5: Verify the board is empty
    console.log('Step 5: Verifying board is empty...');
    const layersAfterNew = await canvas.layerCount(page);
    const edgesAfterNew = await canvas.edgeCount(page);
    console.log(`Layers after NEW: ${layersAfterNew}`);
    console.log(`Edges after NEW: ${edgesAfterNew}`);
    expect(layersAfterNew).toBe(0);
    expect(edgesAfterNew).toBe(0);
    // Step 6: Load the saved file
    console.log('Step 6: Loading saved file...');
    const fileMenu4 = await page.$('text=File');
    await fileMenu4!.click();
    await page.waitForTimeout(50);
    // File > Load opens the cloud-aware modal; the device path opens the chooser.
    const loadOption = await page.$('text=Load');
    expect(loadOption).not.toBeNull();
    await loadOption!.click();
    await page.waitForTimeout(100);
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Load from this device")');
    // Upload the saved file
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(downloadPath);
    await page.waitForTimeout(150);
    // Step 7: Verify the graph is restored correctly
    console.log('Step 7: Verifying graph restored from file...');
    const layersAfterReload = await canvas.layerCount(page);
    const edgesAfterReload = await canvas.edgeCount(page);
    console.log(`Layers after reload: ${layersAfterReload}`);
    console.log(`Edges after reload: ${edgesAfterReload}`);
    expect(layersAfterReload).toBe(initialLayerCount);
    expect(edgesAfterReload).toBe(initialEdgeCount);
    // Verify layer types match
    const reloadedLayerNames = await canvas.layerLabels(page);
    console.log('Reloaded layer types:', reloadedLayerNames);
    expect(reloadedLayerNames.sort()).toEqual(initialLayerNames.sort());
    console.log('✅ SAVE/LOAD FILE TEST PASSED');
    expect(consoleErrors.length).toBe(0);
  },
);
