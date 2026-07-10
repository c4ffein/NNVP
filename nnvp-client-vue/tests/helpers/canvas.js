import { test as base } from '@playwright/test';

// Canvas driver: hides the DOM differences between the two boards so the same
// specs run against both. The Playwright project picks the mode via the
// `canvasMode` option (see playwright.config.js): `flow` (the default canvas,
// Vue Flow) or `d3` (the legacy whiteboard, reached with ?canvas=d3).
//
// Layer ids are the same in both modes: creation order 0..n (D3's getNodeId
// and the adapter's nextLayerId both hand out the first free integer), so
// specs can address nodes by id through the driver.

function makeDriver(mode) {
  const d3 = mode === 'd3';
  const driver = {
    mode,
    // Where beforeEach should navigate: the flow board is the default canvas,
    // the D3 whiteboard stays reachable behind ?canvas=d3.
    home: d3 ? '/?canvas=d3' : '/',
    // Selector for layer nodes on the board (NOT composites).
    layer: d3 ? '.d3Layer' : '.vue-flow__node-layer',
    // Selector for composite (grouped) nodes.
    composite: d3 ? '.d3CompositeLayer' : '.vue-flow__node-composite',
    // Selector matching one element per layer whose textContent is its label.
    label: d3 ? '.d3Layer text' : '.vue-flow__node-layer .flow-layer-label',
    // Selector for connections between layers.
    edge: d3 ? '.link:not(.dragline)' : '.vue-flow__edge',
    // The board component's root element.
    board: d3 ? '#WhiteBoard' : '#FlowBoard',
    // The empty canvas surface (click it to deselect).
    pane: d3 ? '#svgWrapper svg' : '.vue-flow__pane',
    // A specific layer, by the integer id both editors assign in creation order.
    layerById: id => (d3 ? `#d3-layer-${id}` : `.vue-flow__node[data-id="${id}"]`),

    async layerCount(page) {
      return page.locator(driver.layer).count();
    },
    async compositeCount(page) {
      return page.locator(driver.composite).count();
    },
    async edgeCount(page) {
      return page.locator(driver.edge).count();
    },
    async layerLabels(page) {
      return page.$$eval(driver.label, els => els.map(el => el.textContent));
    },

    // The current pan/zoom transform of the board, as an opaque string that
    // changes when the viewport moves (D3: <g transform>, flow: CSS transform).
    async viewportTransform(page) {
      if (d3) {
        return page.$eval('#svgWrapper svg g', g => g.getAttribute('transform'));
      }
      return page.$eval('.vue-flow__transformationpane', el => el.style.transform);
    },

    // Move a layer to absolute board coordinates through the debug editor
    // handle (both editors are exposed as window.nnvp.debug.graphEditor).
    async moveLayer(page, id, x, y) {
      await page.evaluate(([layerId, posX, posY, isD3]) => {
        const editor = window.nnvp.debug.graphEditor;
        if (isD3) editor.findLayerById(layerId).transitionToXY(posX, posY);
        else editor.moveLayerTo(layerId, posX, posY);
      }, [id, x, y, d3]);
    },

    // The output anchor / target drop area of the nth layer on the board.
    // Index-based on purpose: after delete + re-add the two editors hand out
    // DIFFERENT ids (D3 refills gaps, flow always uses max+1), but the nth
    // layer element is the nth-created in both.
    sourceAnchorOf(page, index) {
      return d3
        ? page.locator(driver.layer).nth(index).locator('circle.bottom-point')
        : page.locator(driver.layer).nth(index).locator('.vue-flow__handle[data-handleid="s-right"]');
    },
    targetDropOf(page, index) {
      return d3
        ? page.locator(driver.layer).nth(index).locator('rect').first()
        : page.locator(driver.layer).nth(index).locator('.vue-flow__handle[data-handleid="t-left"]');
    },

    // Drag a connection from the nth layer's output anchor to the mth layer.
    async connect(page, sourceIndex, targetIndex) {
      await driver.dragBetween(
        page,
        driver.sourceAnchorOf(page, sourceIndex),
        driver.targetDropOf(page, targetIndex),
      );
    },

    // Drag from the nth layer's output anchor and release over an arbitrary
    // point (used by the "drop a connection on empty canvas" negative tests).
    async dragFromAnchorTo(page, sourceIndex, clientX, clientY) {
      const box = await driver.sourceAnchorOf(page, sourceIndex).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(clientX, clientY, { steps: 10 });
      await page.mouse.up();
    },

    // Click the first edge to select it. Both boards mark the selection with
    // a `selected` class on the edge root element. Curved edges can run under
    // the nodes they connect, so walk the path geometry and click the first
    // point where the edge itself is the hit target.
    async selectFirstEdge(page) {
      const [pathSelector, edgeSelector] = d3
        ? ['.edge path', '.edge']
        : ['.vue-flow__edge path', '.vue-flow__edge'];
      const point = await page.evaluate(([pathSel, edgeSel]) => {
        const path = document.querySelector(pathSel);
        const edge = path.closest(edgeSel);
        const total = path.getTotalLength();
        const ctm = path.getScreenCTM();
        const toScreen = (p) => ({
          x: ctm.a * p.x + ctm.c * p.y + ctm.e,
          y: ctm.b * p.x + ctm.d * p.y + ctm.f,
        });
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
          const screen = toScreen(path.getPointAtLength(total * t));
          const hit = document.elementFromPoint(screen.x, screen.y);
          if (hit && hit.closest(edgeSel) === edge) return screen;
        }
        return toScreen(path.getPointAtLength(total / 2));
      }, [pathSelector, edgeSelector]);
      await page.mouse.click(point.x, point.y);
    },
    selectedEdge: d3 ? '.edge.selected' : '.vue-flow__edge.selected',

    // Click an empty spot on the canvas to clear the selection: right of the
    // catalog, near the bottom, where neither board places nodes by default.
    async deselect(page) {
      const box = await page.locator(driver.pane).boundingBox();
      await page.mouse.click(box.x + 260, box.y + box.height - 40);
    },

    async dragBetween(page, sourceLocator, targetLocator) {
      const sourceBox = await sourceLocator.boundingBox();
      const targetBox = await targetLocator.boundingBox();
      await page.mouse.move(
        sourceBox.x + sourceBox.width / 2,
        sourceBox.y + sourceBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: 10 },
      );
      await page.mouse.up();
    },
  };
  return driver;
}

export const test = base.extend({
  // Overridden per Playwright project in playwright.config.js.
  canvasMode: ['flow', { option: true }],
  canvas: async ({ canvasMode }, use) => {
    await use(makeDriver(canvasMode));
  },
});

export { expect } from '@playwright/test';
