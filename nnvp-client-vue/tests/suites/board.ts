/**
 * Board behavior: one definition, both modes (see tests/harness/define.js).
 * These only speak to world.board — no page, no DOM, no component internals.
 */
import KerasGenerator from '../../src/lib/KerasInterface/KerasGenerator';
import { appTest, e2eOnly } from '../harness/define';
import type { NnvpModel } from '../../src/types/model';

const MNIST_TEMPLATE = '2D Dense for MNIST';

appTest('adds layers to the board', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dropout');
  expect(await board.layerCount()).toBe(2);
  const labels = await board.layerLabels();
  expect(labels).toContain('Dense');
  expect(labels).toContain('Dropout');
});

appTest('connects layers', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  expect(await board.edgeCount()).toBe(0);
  await board.connect(0, 1);
  expect(await board.edgeCount()).toBe(1);
});

appTest('refuses self and duplicate connections, allows cycle-closing ones', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  await board.connect(1, 2);
  expect(await board.edgeCount()).toBe(2);
  await board.connect(0, 0); // self — refused
  await board.connect(0, 1); // duplicate — refused
  expect(await board.edgeCount()).toBe(2);
  // Closing 0 -> 1 -> 2 -> 0 is allowed since Phase D: the loop renders red
  // (edgeInCycle) and codegen refuses the cyclic graph explicitly instead.
  await board.connect(2, 0);
  expect(await board.edgeCount()).toBe(3);
});

appTest('deleting a layer removes its edges', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  await board.connect(1, 2);
  await board.select(1); // the middle of the chain
  await board.deleteSelected();
  expect(await board.layerCount()).toBe(2);
  expect(await board.edgeCount()).toBe(0);
});

appTest('undo and redo restore the graph', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dropout');
  await board.select(1);
  await board.deleteSelected();
  expect(await board.layerCount()).toBe(1);
  await board.undo();
  expect(await board.layerCount()).toBe(2);
  expect(await board.layerLabels()).toContain('Dropout');
  await board.redo();
  expect(await board.layerCount()).toBe(1);
});

appTest('loads a template', async ({ board, expect }) => {
  await board.loadTemplate(MNIST_TEMPLATE);
  expect(await board.layerCount()).toBe(5);
  expect(await board.edgeCount()).toBe(4);
  const labels = await board.layerLabels();
  for (const label of ['Input', 'Flatten', 'Dense', 'Output']) {
    expect(labels).toContain(label);
  }
});

appTest('the model JSON round-trips through save and load', async ({ board, expect }) => {
  await board.loadTemplate(MNIST_TEMPLATE);
  const saved = await board.graphJSON();
  await board.clearBoard();
  expect(await board.layerCount()).toBe(0);
  await board.loadJSON(saved);
  expect(await board.layerCount()).toBe(5);
  expect(await board.edgeCount()).toBe(4);
  // Lossless: reserializing the reloaded board yields the same model.
  expect(JSON.parse(await board.graphJSON())).toEqual(JSON.parse(saved));
});

appTest('moving a layer persists in the model', async ({ board, expect }) => {
  await board.addLayer('Dense');
  const before = (JSON.parse(await board.graphJSON()) as NnvpModel).layers[0]!;
  await board.moveLayer(before.id, 321, 123);
  const after = (JSON.parse(await board.graphJSON()) as NnvpModel).layers[0]!;
  expect(after.x).toBe(321);
  expect(after.y).toBe(123);
});

appTest('the board generates TensorFlow code in both languages', async ({ board, expect }) => {
  await board.loadTemplate(MNIST_TEMPLATE);
  const json = await board.graphJSON();
  // KerasGenerator mutates its input, so feed it fresh parses.
  const python = new KerasGenerator(JSON.parse(json) as NnvpModel).generatePythonFromGraph();
  const javascript = new KerasGenerator(JSON.parse(json) as NnvpModel).generateJavascriptFromGraph();
  expect(python).toContain('Dense');
  expect(python).toContain('keras');
  expect(javascript).toContain('tf.layers.dense');
});

e2eOnly(
  'clicking an edge path selects it',
  'Walks the rendered SVG path with getPointAtLength + elementFromPoint to find a clickable point between nodes — hit-testing against real layout, which happy-dom (no layout engine) cannot evaluate.',
  async ({ board, page, canvas, expect }) => {
    await board.loadTemplate(MNIST_TEMPLATE);
    await canvas.selectFirstEdge(page);
    expect(await page.locator(canvas.selectedEdge).count()).toBe(1);
  },
);

appTest('layer comments are edited from the options panel and survive save/load', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dropout');
  await board.setComment(1, 'regularize hard');
  expect(await board.comment(1)).toBe('regularize hard');
  expect(await board.comment(0)).toBe('');
  const json = await board.graphJSON();
  const model = JSON.parse(json) as NnvpModel;
  expect(model.layers[1]!.comment).toBe('regularize hard');
  expect('comment' in model.layers[0]!).toBe(false);
  await board.clearBoard();
  await board.loadJSON(json);
  expect(await board.comment(1)).toBe('regularize hard');
});
