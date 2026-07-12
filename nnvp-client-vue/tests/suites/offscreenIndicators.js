/**
 * Border arrows for off-screen layers: the geometry is a pure function
 * (src/lib/FlowInterface/offscreenIndicators.js) mapping (nodes, viewport,
 * pane size) -> indicators on the pane border, each placed where the ray from
 * the screen center to its layer crosses the border and angled along it.
 * OffscreenArrows.vue renders them; the rendering itself is e2e-covered.
 */
import { logicTest, e2eOnly } from '../harness/define';
import offscreenIndicators from '../../src/lib/FlowInterface/offscreenIndicators';

const PANE = { width: 800, height: 600 };
const IDENTITY = { x: 0, y: 0, zoom: 1 };

function node(id, x, y, extra = {}) {
  return {
    id,
    position: { x, y },
    dimensions: { width: 100, height: 40 },
    data: { label: id },
    ...extra,
  };
}

logicTest('offscreen: a visible node produces no indicator', ({ expect }) => {
  expect(offscreenIndicators([node('a', 100, 100)], IDENTITY, PANE)).toEqual([]);
});

logicTest('offscreen: a partially visible node produces no indicator', ({ expect }) => {
  // Sticks out past the left border but still intersects the pane.
  expect(offscreenIndicators([node('a', -50, 100)], IDENTITY, PANE)).toEqual([]);
});

logicTest('offscreen: the arrow sits where the center-to-layer ray crosses the border', ({ expect }) => {
  // Node center (2050, 120); screen center (400, 300). The ray leaves through
  // the right border (x = 800 - 28 = 772) at t = 372/1650, so
  // y = 300 + (120 - 300) * t ≈ 259.4, pointing slightly upward.
  const [ind] = offscreenIndicators([node('a', 2000, 100)], IDENTITY, PANE);
  expect(ind.id).toBe('a');
  expect(ind.x).toBe(PANE.width - 28);
  expect(ind.y).toBeCloseTo(300 + (120 - 300) * (372 / 1650), 5);
  expect(ind.angle).toBeCloseTo((Math.atan2(120 - 300, 2050 - 400) * 180) / Math.PI, 5);
  expect(ind.count).toBe(1);
});

logicTest('offscreen: a layer straight out one side exits through that side, dead-on', ({ expect }) => {
  // Node center (2050, 300) sits exactly on the horizontal through the
  // screen center (400, 300): a pure +x ray.
  const [ind] = offscreenIndicators([node('a', 2000, 280)], IDENTITY, PANE);
  expect(ind.x).toBe(PANE.width - 28);
  expect(ind.y).toBe(300);
  expect(ind.angle).toBe(0); // due right
});

logicTest('offscreen: layers in the same direction share a ray and merge into one counted arrow', ({ expect }) => {
  // Collinear with the screen center (400, 300): all three centers sit on
  // the slope-0.1 ray (center y = 300 + (center x - 400) / 10), so they share
  // one border point.
  const ray = [node('a', 2000, 445), node('b', 2500, 495), node('c', 3000, 545)];
  const result = offscreenIndicators(ray, IDENTITY, PANE);
  expect(result).toHaveLength(1);
  expect(result[0].count).toBe(3);
  expect(result[0].id).toBe('a'); // pans to the closest of the cluster
  expect(result[0].label).toBe('a');
});

logicTest('offscreen: a node up-left exits through whichever border its ray hits first', ({ expect }) => {
  // Node center (-950, -980): the ray from (400, 300) hits the top border
  // (y = 28) before the left one, at x = 400 + (-1350) * (272/1280) ≈ 113.1.
  const [ind] = offscreenIndicators([node('a', -1000, -1000)], IDENTITY, PANE);
  expect(ind.y).toBe(28);
  expect(ind.x).toBeCloseTo(400 - 1350 * (272 / 1280), 5);
  expect(ind.angle).toBeLessThan(-90); // up-left quadrant
  expect(ind.angle).toBeGreaterThan(-180);
});

logicTest('offscreen: the viewport transform (pan + zoom) decides visibility', ({ expect }) => {
  const layers = [node('a', 1000, 100)];
  // Panned so the node is on screen: no arrow.
  expect(offscreenIndicators(layers, { x: -800, y: 0, zoom: 1 }, PANE)).toEqual([]);
  // Zoomed out enough that x=1000 lands inside the pane: no arrow either.
  expect(offscreenIndicators(layers, { x: 0, y: 0, zoom: 0.5 }, PANE)).toEqual([]);
  // Zoomed in, the same node is far off screen again.
  expect(offscreenIndicators(layers, { x: 0, y: 0, zoom: 2 }, PANE)).toHaveLength(1);
});

logicTest('offscreen: hidden nodes and unmeasured panes are skipped', ({ expect }) => {
  expect(offscreenIndicators([node('a', 2000, 100, { hidden: true })], IDENTITY, PANE)).toEqual([]);
  expect(offscreenIndicators([node('a', 2000, 100)], IDENTITY, { width: 0, height: 0 })).toEqual([]);
});

logicTest('offscreen: children of composites use their absolute position', ({ expect }) => {
  // position is parent-relative (looks on-screen); computedPosition is truth.
  const child = node('child', 10, 10, { computedPosition: { x: 5000, y: 10 } });
  const result = offscreenIndicators([child], IDENTITY, PANE);
  expect(result).toHaveLength(1);
  expect(result[0].x).toBe(PANE.width - 28); // exits right, not on-screen
});

logicTest('offscreen: indicators carry the layer label for the tooltip', ({ expect }) => {
  const named = node('n1', 3000, 50);
  named.data.label = 'Dense_3';
  expect(offscreenIndicators([named], IDENTITY, PANE)[0].label).toBe('Dense_3');
});

e2eOnly(
  'offscreen: border arrows appear for off-screen layers and clicking one pans back',
  'Needs Vue Flow to measure real node dimensions and the pane size, and asserts on rendered .offscreen-arrow DOM plus the post-pan viewport transform — none of which exist headless.',
  async ({ page, expect }) => {
    // Two layers: one on screen, one far off to the right.
    await page.evaluate(() => {
      const editor = window.nnvp.debug.graphEditor;
      editor.model.loadJSON({
        layers: [
          { id: 0, class: 'Dense', name: 'Near', x: 100, y: 100, inputs: [], outputs: [] },
          { id: 1, class: 'Dense', name: 'Far', x: 4000, y: 100, inputs: [], outputs: [] },
        ],
        edges: [],
      });
      editor.updateGraph();
    });
    await page.waitForTimeout(200);
    const arrows = page.locator('.offscreen-arrow');
    expect(await arrows.count()).toBe(1);
    expect(await arrows.first().getAttribute('aria-label')).toContain('Far');
    await arrows.first().click();
    await page.waitForTimeout(600); // pan animation
    // The far node is now visible, so its arrow is gone (the near one's may
    // have appeared instead — we only assert the clicked target resolved).
    expect(await page.locator('.offscreen-arrow[aria-label*="Far"]').count()).toBe(0);
  },
  { timeoutMs: 20000 },
);
