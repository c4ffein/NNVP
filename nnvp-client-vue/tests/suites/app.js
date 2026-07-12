/**
 * App shell smoke tests, migrated from tests/app.spec.js (mechanical wraps).
 * All five assert rendered chrome, layout geometry, or browser console
 * cleanliness — none of which exist outside a real browser.
 */
import { e2eOnly } from '../harness/define';

// Replicates the original spec's beforeEach console tracking: attach the
// collectors, then (re)load the app so load-time errors are captured too.
async function startErrorTracking(page, canvas) {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`PAGE ERROR: ${error.message}`);
  });
  await page.goto(canvas.home);
  await page.waitForTimeout(100);
  return consoleErrors;
}

e2eOnly(
  'app: should load the app without console errors',
  'The assertion IS the browser console: it verifies the app boots without console errors or pageerrors, which only a live page emits.',
  async ({ page, canvas, expect }) => {
    const consoleErrors = await startErrorTracking(page, canvas);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'app: should render the main components',
  'Asserts the app shell chrome (#generalMenu, #layerCatalog, #layerOptions, the board) is present in the rendered DOM and that the TrainingZone is NOT mounted on load — rendered page structure only a browser produces.',
  async ({ page, canvas, expect }) => {
    const generalMenu = await page.$('#generalMenu');
    const layerCatalog = await page.$('#layerCatalog');
    const layerOptions = await page.$('#layerOptions');
    const board = await page.$(canvas.board);
    expect(generalMenu).not.toBeNull();
    expect(layerCatalog).not.toBeNull();
    expect(layerOptions).not.toBeNull();
    expect(board).not.toBeNull();
    // TrainingZone should NOT be rendered initially (v-if="trainerHeight > 0")
    const trainingZone = await page.$('#trainingZone');
    expect(trainingZone).toBeNull();
  },
);

e2eOnly(
  'app: should display layer templates in layer catalog',
  'Reads the rendered #layerCatalog DOM text to assert the catalog UI actually displays content in the live page.',
  async ({ page, expect }) => {
    const layerCatalogContent = await page.textContent('#layerCatalog');
    expect(layerCatalogContent.length).toBeGreaterThan(0);
  },
);

e2eOnly(
  'app: should position new layers below GeneralMenu and right of LayerCatalog',
  'Compares boundingBox geometry of the floating panels against a freshly dropped layer — real layout measurements only a browser layout engine produces.',
  async ({ page, canvas, expect }) => {
    const generalMenu = await page.$('#generalMenu');
    const layerCatalog = await page.$('#layerCatalog');
    const menuBox = await generalMenu.boundingBox();
    const catalogBox = await layerCatalog.boundingBox();
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    const canvasLayer = await page.$(canvas.layer);
    const layerBox = await canvasLayer.boundingBox();
    // Layer should be below GeneralMenu and right of LayerCatalog (not overlapping).
    expect(layerBox.y > (menuBox.y + menuBox.height)).toBe(true);
    expect(layerBox.x > (catalogBox.x + catalogBox.width)).toBe(true);
  },
);

e2eOnly(
  'app: should pan the board correctly without resetting to 0,0',
  'Performs a real mouse drag on empty canvas and verifies the viewport transform and the layer\'s getBoundingClientRect move by the drag delta — pointer-driven panning over computed layout.',
  async ({ page, canvas, expect }) => {
    const pane = await page.$(canvas.pane);
    const paneBox = await pane.boundingBox();
    const initialTransform = await canvas.viewportTransform(page);
    const denseLayer = await page.$('.LayerTemplate:has-text("Dense")');
    await denseLayer.click();
    await page.waitForTimeout(50);
    const initialLayerPos = await page.evaluate((layerSelector) => {
      const layer = document.querySelector(layerSelector);
      const rect = layer.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    }, canvas.layer);
    // Perform a pan by dragging on empty space, clear of the new layer.
    const startX = paneBox.x + 400;
    const startY = paneBox.y + 300;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(100); // ensure the drag is recognized
    await page.mouse.move(startX + 100, startY + 50, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    const finalTransform = await canvas.viewportTransform(page);
    const finalLayerPos = await page.evaluate((layerSelector) => {
      const layer = document.querySelector(layerSelector);
      const rect = layer.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    }, canvas.layer);
    expect(finalTransform).not.toBe(initialTransform);
    // The layer moved approximately by the drag amount (20px tolerance).
    expect(Math.abs((finalLayerPos.x - initialLayerPos.x) - 100)).toBeLessThan(20);
    expect(Math.abs((finalLayerPos.y - initialLayerPos.y) - 50)).toBeLessThan(20);
    // And it stays clear of the floating panels after panning.
    const menuBox = await (await page.$('#generalMenu')).boundingBox();
    const catalogBox = await (await page.$('#layerCatalog')).boundingBox();
    expect(finalLayerPos.y > (menuBox.y + menuBox.height)).toBe(true);
    expect(finalLayerPos.x > (catalogBox.x + catalogBox.width)).toBe(true);
  },
);
