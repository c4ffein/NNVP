/**
 * The read-only mini renderer (Phase G3): NnvpModel JSON → a static box/line
 * layout from the STORED node positions (no Vue Flow, no layout engine — the
 * snapshot already knows where everything was). Pure, viewBox-normalized.
 */
import { logicTest } from '../harness/define';
import { previewLayout } from '../../src/lib/Training/modelPreview';
import type { KerasLayerJSON, NnvpModel } from '../../src/types/model';

const kl = (name: string): KerasLayerJSON => ({
  name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues: {}, customUserLayer: false,
} as unknown as KerasLayerJSON);

const model = (): NnvpModel => ({
  formatVersion: 2,
  layers: [
    {
      class: 'Layer', id: 0, htmlID: 'layer-0', name: 'Input', x: 40, y: 60, width: 90, height: 40,
      inputLayers: [], outputLayers: [1], children: null, kerasLayer: kl('Input'), parentID: null,
    },
    {
      class: 'Group', id: 10, htmlID: 'layer-10', name: 'Block', x: 180, y: 40, width: 200, height: 120,
      inputLayers: [], outputLayers: [], children: [
        {
          class: 'Layer', id: 1, htmlID: 'layer-1', name: 'encoder', x: 200, y: 80, width: 90, height: 40,
          inputLayers: [0], outputLayers: [], children: null, kerasLayer: kl('Dense'), parentID: 10,
        },
      ], kerasLayer: null, parentID: null,
    },
  ],
  edges: [{ source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' }],
  inputs: [0],
  outputs: [1],
});

logicTest('modelPreview: boxes at stored positions, lines between layer centers', ({ expect }) => {
  const layout = previewLayout(model())!;
  expect(layout.boxes.length).toBe(2); // leaves only — the group is a frame
  const inputBox = layout.boxes.find(box => box.label === 'Input')!;
  const denseBox = layout.boxes.find(box => box.label === 'encoder')!;
  expect(denseBox.x).toBeGreaterThan(inputBox.x);
  expect(layout.lines.length).toBe(1);
  const [line] = layout.lines;
  expect(line!.x1).toBe(inputBox.x + inputBox.width / 2);
  expect(line!.x2).toBe(denseBox.x + denseBox.width / 2);
  // The viewBox wraps everything with padding — no box may start before it.
  expect(layout.boxes.every(box => box.x >= layout.viewBox.x)).toBe(true);
  expect(layout.viewBox.width).toBeGreaterThan(0);
});

logicTest('modelPreview: unusable snapshots yield null instead of throwing', ({ expect }) => {
  expect(previewLayout('{not json')).toBeNull();
  expect(previewLayout(JSON.stringify({ layers: [] }))).toBeNull(); // nothing to draw
});

logicTest('modelPreview: feedback (backward) edges arc instead of hiding under the chain', ({ expect }) => {
  const elman = model();
  // A feedback edge: from the group's child (x=200) BACK to the input (x=40).
  elman.edges.push({ source: 1, target: 0, id: 's1_t0', htmlID: 's1_t0', unrollSteps: 3 });
  const layout = previewLayout(elman)!;
  const forward = layout.lines[0]!;
  const backward = layout.lines[1]!;
  expect(forward.bend).toBeUndefined(); // forward edges stay straight
  expect(backward.bend).toBeDefined(); // the arc that makes the cycle visible
  expect(backward.bend!.y).toBeGreaterThan(Math.max(backward.y1, backward.y2));
});
