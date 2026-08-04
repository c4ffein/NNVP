/**
 * Migrated from tests/interactions.spec.js. Every test here carried the
 * original spec's beforeEach console/pageerror tracking and asserted a clean
 * console at the end — an assertion only a real browser can evaluate — so
 * they are e2eOnly mechanical wraps. The graph-substance parts (adding
 * layers, undo/redo) are covered mode-agnostically by board.js.
 */
import type { Page } from '@playwright/test';
import { e2eOnly } from '../harness/define';
import type { CanvasDriver } from '../harness/canvas';

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
  'interactions: should be able to search for layers',
  'Types into the real search box and counts rendered .LayerTemplate DOM elements to assert catalog filtering, and asserts the browser console/pageerror streams stayed clean — both only observable in a live page.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    const searchBox = await page.$('#layerSearchBox');
    expect(searchBox).not.toBeNull();
    // Get content before search
    const leftBarTextBefore = await page.textContent('.LayerCatalog');
    const visibleLayersBefore = await page.$$('.LayerTemplate');
    // Type "dense" in the search box
    await searchBox!.type('dense');
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
    expect(leftBarTextAfter!.length).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: should have working top menu',
  'Reads the rendered #GeneralMenu DOM for the menu titles and asserts a clean browser console/pageerror stream — menu chrome rendering and console capture require a live browser.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    // Try clicking File menu
    const fileMenuItems = await page.$$eval('#GeneralMenu .menuTitle',
      elements => elements.map(el => el.textContent)
    );
    console.log('\n=== TOP MENU TEST ===');
    console.log('Menu items found:', fileMenuItems);
    expect(fileMenuItems.length).toBeGreaterThan(0);
    expect(fileMenuItems).toContain('File');
    expect(fileMenuItems).toContain('Edit');
    expect(fileMenuItems).toContain('Export'); // code generation menu (Phase G1)
    expect(fileMenuItems).toContain('Panels'); // Training lives under Panels now
    expect(fileMenuItems).toContain('Tutorial');
    // Settings and About left the menubar for the corner controls' gear and
    // ? buttons (tabs of the account panel).
    expect(fileMenuItems).not.toContain('Settings');
    expect(fileMenuItems).not.toContain('About');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: should open File menu and show options',
  'Asserts the dropdown becomes VISIBLE after the click via page.isVisible / computed styles — element visibility is a layout+CSS question only a real browser can evaluate.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== FILE MENU TEST ===');
    // Find the File menu item in GeneralMenu
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    console.log('File menu element found:', fileMenu !== null);
    // Check initial state
    const initialActivated = await page.$$('.menu.activated');
    console.log('Initially activated menus:', initialActivated.length);
    // Click on File menu
    await fileMenu!.click();
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
    // Code generation moved to its own Export menu (Phase G1): File keeps the
    // document verbs, the targets live under Export with tidied labels.
    const hasExportTarget = menuItemsText!.includes('Python (Keras)');
    const hasSave = menuItemsText!.includes('Save');
    const hasLoad = menuItemsText!.includes('Load');
    console.log('Has Export target:', hasExportTarget);
    console.log('Has Save option:', hasSave);
    console.log('Has Load option:', hasLoad);
    expect(dropdownVisible).toBe(true);
    expect(hasExportTarget).toBe(true);
    expect(hasSave).toBe(true);
    expect(hasLoad).toBe(true);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: should have a canvas surface in the board',
  'Measures the pane element boundingBox and asserts nonzero width/height — real layout geometry that only a browser layout engine produces.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    const pane = await page.$(canvas.pane);
    expect(pane).not.toBeNull();
    const paneBBox = (await pane!.boundingBox())!;
    console.log('\n=== BOARD SURFACE TEST ===');
    console.log('Canvas surface found');
    console.log('Surface dimensions:', paneBBox);
    console.log('Surface has width:', paneBBox.width > 0);
    console.log('Surface has height:', paneBBox.height > 0);
    expect(paneBBox.width).toBeGreaterThan(0);
    expect(paneBBox.height).toBeGreaterThan(0);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: should be able to check layer categories',
  'Counts the rendered .layerCategory entries of the catalog UI in the DOM and asserts a clean browser console/pageerror stream.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
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
  },
);

e2eOnly(
  'interactions: should not have any runtime errors after 3 seconds',
  'The assertion IS the browser console: it verifies no console errors or pageerrors are emitted after the app loads, which only a real browser can produce.',
  async ({ page, canvas, expect }) => {
    const { consoleMessages, consoleErrors } = await startErrorTracking(page, canvas);
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
  },
);

e2eOnly(
  'interactions: should handle undo/redo state correctly',
  "Asserts the Edit menu's Undo/Redo items toggle their 'disabled' CSS class through real menu open/close cycles — menu chrome state as UI, plus a clean-console assertion.",
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== UNDO/REDO STATE TEST ===');
    // Helper to check if menu item is disabled
    const isMenuItemDisabled = async (itemText: string) => {
      // Open Edit menu
      const editMenu = await page.$('#GeneralMenu .menuTitle:has-text("Edit")');
      await editMenu!.click();
      await page.waitForTimeout(20);
      // Check if the menu item has disabled class
      const menuItem = await page.$(`#GeneralMenu .menuItem:has-text("${itemText}")`);
      const isDisabled = await menuItem!.evaluate(el => el.classList.contains('disabled'));
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
    await denseLayer!.click();
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
    await editMenu!.click();
    await page.waitForTimeout(20);
    const undoItem = await page.$('#GeneralMenu .menuItem:has-text("Undo")');
    await undoItem!.click();
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
    await editMenu2!.click();
    await page.waitForTimeout(20);
    const redoItem = await page.$('#GeneralMenu .menuItem:has-text("Redo")');
    await redoItem!.click();
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
  },
);

e2eOnly(
  'interactions: should NOT show beforeunload warning when graph is empty',
  'Invokes window.onbeforeunload on the real window object to assert no unsaved-work warning fires for an empty graph — that handler only exists in a live page.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== BEFOREUNLOAD WARNING TEST (EMPTY GRAPH) ===');

    // Graph starts empty, so beforeunload should return undefined
    const beforeunloadResult = await page.evaluate(() => {
      const event = new Event('beforeunload');
      return window.onbeforeunload!(event as BeforeUnloadEvent);
    });

    console.log('Beforeunload result on empty graph:', beforeunloadResult);
    expect(beforeunloadResult).toBeUndefined();
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: should show beforeunload warning when graph has layers',
  'Invokes window.onbeforeunload on the real window object to assert the unsaved-work warning message once the graph has layers — browser-only navigation hook.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== BEFOREUNLOAD WARNING TEST (GRAPH WITH LAYERS) ===');
    // Add a layer to the graph
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    expect(denseLayer).not.toBeNull();
    await denseLayer!.click();
    await page.waitForTimeout(50);
    // Verify layer was added
    const layersCount = await canvas.layerCount(page);
    console.log('Layers on canvas:', layersCount);
    expect(layersCount).toBeGreaterThan(0);
    // Now beforeunload should return a warning message
    const beforeunloadResult = await page.evaluate(() => {
      const event = new Event('beforeunload');
      return window.onbeforeunload!(event as BeforeUnloadEvent);
    });
    console.log('Beforeunload result with layers:', beforeunloadResult);
    expect(beforeunloadResult).toBe('Warning : all unsaved data will be lost');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'interactions: clicking another menu title while one is open switches to it',
  'Real pointer semantics: the hover that precedes a click already switches the open menu, so only a browser mouse reproduces the hover-then-click toggle bug this pins.',
  async ({ page, expect }) => {
    await page.click('#GeneralMenu .menuTitle:has-text("File")');
    await page.waitForTimeout(100);
    expect(await page.isVisible('.menu.activated > .dropdown-content')).toBe(true);
    // The regression this guards: this click used to toggle the freshly
    // hover-opened Panels straight back closed — a dead click.
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.waitForTimeout(100);
    expect(await page.isVisible('.menu.activated > .dropdown-content')).toBe(true);
    const openTitle = await page.textContent('.menu.activated .menuTitle');
    expect(openTitle).toContain('Panels');
    // A second deliberate click on the SAME title still closes.
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.waitForTimeout(100);
    expect(await page.isVisible('.menu.activated > .dropdown-content')).toBe(false);
  },
);

e2eOnly(
  'interactions: the icon-titled Debug menu opens and never wedges the menubar',
  'The regression this pins: clicking the SVG bug icon made event.target an svg internal node, getMenuElement returned undefined and the thrown TypeError wedged menu state — only a real browser dispatches clicks to SVG internals.',
  async ({ page, expect }) => {
    // Dev server = dev build, so the Debug menu exists here.
    await page.click('#GeneralMenu .menuTitle:has(svg)');
    await page.waitForTimeout(100);
    expect(await page.isVisible('.menu.activated > .dropdown-content')).toBe(true);
    await page.click('#GeneralMenu .menuTitle:has(svg)'); // close it again
    await page.waitForTimeout(100);
    // The aftermath that mattered: the REST of the bar must still work.
    await page.click('#GeneralMenu .menuTitle:has-text("File")');
    await page.waitForTimeout(100);
    expect(await page.isVisible('.menu.activated > .dropdown-content')).toBe(true);
  },
);
