import { test as base, type Locator, type Page } from '@playwright/test';
import type FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import type { NnvpLayerId } from '../../src/types/model';

// Canvas driver for the Vue Flow board. Historically this hid the DOM
// differences between the D3 whiteboard and the flow board so every spec ran
// against both; the D3 board is gone, but specs keep addressing the canvas
// through this driver.
//
// Layer ids are creation order 0..n (the adapter's nextLayerId hands out the
// first free integer), so specs can address nodes by id through the driver.

// Dev-only debug handle main.ts installs (same local-typing pattern).
type NnvpDebugWindow = Window & { nnvp: { debug: { graphEditor: FlowGraphEditor } } };

export interface CanvasDriver {
  mode: 'flow';
  /** Where beforeEach should navigate. */
  home: string;
  /** Selector for layer nodes on the board (NOT composites). */
  layer: string;
  /** Selector for composite (grouped) nodes. */
  composite: string;
  /** Selector matching one element per layer whose textContent is its label. */
  label: string;
  /** Selector for connections between layers. */
  edge: string;
  /** The board component's root element. */
  board: string;
  /** The empty canvas surface (click it to deselect). */
  pane: string;
  /** A specific layer, by the integer id the editor assigns in creation order. */
  layerById: (id: NnvpLayerId) => string;
  layerCount(page: Page): Promise<number>;
  compositeCount(page: Page): Promise<number>;
  edgeCount(page: Page): Promise<number>;
  layerLabels(page: Page): Promise<(string | null)[]>;
  viewportTransform(page: Page): Promise<string>;
  moveLayer(page: Page, id: NnvpLayerId, x: number, y: number): Promise<void>;
  sourceAnchorOf(page: Page, index: number): Locator;
  targetDropOf(page: Page, index: number): Locator;
  connect(page: Page, sourceIndex: number, targetIndex: number): Promise<void>;
  dragFromAnchorTo(page: Page, sourceIndex: number, clientX: number, clientY: number): Promise<void>;
  selectFirstEdge(page: Page): Promise<void>;
  selectedEdge: string;
  deselect(page: Page): Promise<void>;
  dragBetween(page: Page, sourceLocator: Locator, targetLocator: Locator): Promise<void>;
}

function makeDriver(): CanvasDriver {
  const driver: CanvasDriver = {
    mode: 'flow',
    // Where beforeEach should navigate.
    home: '/',
    // Selector for layer nodes on the board (NOT composites).
    layer: '.vue-flow__node-layer',
    // Selector for composite (grouped) nodes.
    composite: '.vue-flow__node-composite',
    // Selector matching one element per layer whose textContent is its label.
    label: '.vue-flow__node-layer .flow-layer-label',
    // Selector for connections between layers.
    edge: '.vue-flow__edge',
    // The board component's root element.
    board: '#FlowBoard',
    // The empty canvas surface (click it to deselect).
    pane: '.vue-flow__pane',
    // A specific layer, by the integer id the editor assigns in creation order.
    layerById: id => `.vue-flow__node[data-id="${id}"]`,

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
    // changes when the viewport moves.
    async viewportTransform(page) {
      return page.$eval('.vue-flow__transformationpane', el => el.style.transform);
    },

    // Move a layer to absolute board coordinates through the debug editor
    // handle (the editor is exposed as window.nnvp.debug.graphEditor).
    async moveLayer(page, id, x, y) {
      await page.evaluate(([layerId, posX, posY]) => {
        (window as unknown as NnvpDebugWindow).nnvp.debug.graphEditor.moveLayerTo(layerId, posX, posY);
      }, [id, x, y] as [NnvpLayerId, number, number]);
    },

    // The output anchor / target drop handle of the nth layer on the board.
    // Index-based on purpose so specs survive delete + re-add id renumbering.
    sourceAnchorOf(page, index) {
      return page.locator(driver.layer).nth(index).locator('.vue-flow__handle[data-handleid="s-right"]');
    },
    targetDropOf(page, index) {
      return page.locator(driver.layer).nth(index).locator('.vue-flow__handle[data-handleid="t-left"]');
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
      const box = (await driver.sourceAnchorOf(page, sourceIndex).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(clientX, clientY, { steps: 10 });
      await page.mouse.up();
    },

    // Click the first edge to select it. The selection is marked with a
    // `selected` class on the edge root element. Edges can run under the
    // nodes they connect, so walk the path geometry and click the first
    // point where the edge itself is the hit target.
    async selectFirstEdge(page) {
      const point = await page.evaluate(() => {
        const path = document.querySelector('.vue-flow__edge path') as SVGPathElement;
        const edge = path.closest('.vue-flow__edge');
        const total = path.getTotalLength();
        const ctm = path.getScreenCTM()!;
        const toScreen = (p: DOMPoint) => ({
          x: ctm.a * p.x + ctm.c * p.y + ctm.e,
          y: ctm.b * p.x + ctm.d * p.y + ctm.f,
        });
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
          const screen = toScreen(path.getPointAtLength(total * t));
          const hit = document.elementFromPoint(screen.x, screen.y);
          if (hit && hit.closest('.vue-flow__edge') === edge) return screen;
        }
        return toScreen(path.getPointAtLength(total / 2));
      });
      await page.mouse.click(point.x, point.y);
    },
    selectedEdge: '.vue-flow__edge.selected',

    // Click an empty spot on the canvas to clear the selection: right of the
    // catalog, near the bottom, where the board places no nodes by default.
    async deselect(page) {
      const box = (await page.locator(driver.pane).boundingBox())!;
      await page.mouse.click(box.x + 260, box.y + box.height - 40);
    },

    async dragBetween(page, sourceLocator, targetLocator) {
      const sourceBox = (await sourceLocator.boundingBox())!;
      const targetBox = (await targetLocator.boundingBox())!;
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

export const test = base.extend<{ canvas: CanvasDriver }>({
  canvas: async ({}, use) => { // eslint-disable-line no-empty-pattern
    await use(makeDriver());
  },
});

export { expect } from '@playwright/test';
