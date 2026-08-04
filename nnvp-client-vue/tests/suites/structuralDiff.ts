/**
 * structuralDiff (Phase F3): what changed between two model snapshots —
 * computation changes (layers/params/wiring) kept apart from annotation
 * changes (renames/comments). Pure over NnvpModel JSON, fixture-tested.
 */
import { logicTest } from '../harness/define';
import { structuralDiff, describeDiff } from '../../src/lib/Training/structuralDiff';
import type { KerasLayerJSON, NnvpLayer, NnvpModel } from '../../src/types/model';

const kl = (name: string, parameterValues: Record<string, unknown> = {}): KerasLayerJSON => ({
  name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues, customUserLayer: false,
} as unknown as KerasLayerJSON);

const layer = (id: number, type: string, params: Record<string, unknown> = {}): NnvpLayer => ({
  class: 'Layer', id, htmlID: `layer-${id}`, name: type, x: 0, y: 0,
  inputLayers: [], outputLayers: [], children: null, kerasLayer: kl(type, params), parentID: null,
});

const model = (layers: NnvpLayer[], edges: [number, number][]): NnvpModel => ({
  formatVersion: 2,
  layers,
  edges: edges.map(([source, target]) => (
    { source, target, id: `s${source}_t${target}`, htmlID: `s${source}_t${target}` })),
  inputs: [0],
  outputs: [layers.length - 2],
});

const base = () => model(
  [layer(0, 'Input', { shape: [4] }), layer(1, 'Dense', { units: 8 }), layer(2, 'Output')],
  [[0, 1], [1, 2]],
);

logicTest('structuralDiff: identical models diff to nothing', ({ expect }) => {
  const diff = structuralDiff(base(), base());
  expect(diff.identical).toBe(true);
  expect(describeDiff(diff)).toEqual([]);
});

logicTest('structuralDiff: added and removed layers, matched by id', ({ expect }) => {
  const grown = base();
  grown.layers.push(layer(3, 'Dropout', { rate: 0.3 }));
  grown.edges.push({ source: 1, target: 3, id: 's1_t3', htmlID: 's1_t3' });
  const diff = structuralDiff(base(), grown);
  expect(diff.identical).toBe(false);
  expect(diff.addedLayers.map(l => l.type)).toEqual(['Dropout']);
  expect(diff.addedEdges).toEqual([{ source: '1', target: '3' }]);
  const back = structuralDiff(grown, base());
  expect(back.removedLayers.map(l => l.type)).toEqual(['Dropout']);
  expect(back.removedEdges).toEqual([{ source: '1', target: '3' }]);
});

logicTest('structuralDiff: parameter changes name the layer and both values', ({ expect }) => {
  const tweaked = base();
  tweaked.layers[1]!.kerasLayer!.parameterValues.units = 128;
  const diff = structuralDiff(base(), tweaked);
  expect(diff.changedParams).toEqual([
    { layerId: '1', layerType: 'Dense', param: 'units', from: 8, to: 128 },
  ]);
  const lines = describeDiff(diff);
  expect(lines.some(line => line.includes('units') && line.includes('8') && line.includes('128'))).toBe(true);
});

logicTest('structuralDiff: renames and comments are annotation, never computation', ({ expect }) => {
  const annotated = base();
  annotated.layers[1]!.name = 'encoder';
  annotated.layers[2]!.comment = 'softmax head';
  const diff = structuralDiff(base(), annotated);
  expect(diff.identical).toBe(true); // computation untouched
  expect(diff.renamedLayers).toEqual([{ id: '1', from: 'Dense', to: 'encoder' }]);
  expect(diff.commentChanges).toEqual([{ id: '2', from: null, to: 'softmax head' }]);
  expect(describeDiff(diff).some(line => line.includes('renamed'))).toBe(true);
});

logicTest('structuralDiff: rewiring shows as edge changes', ({ expect }) => {
  const rewired = base();
  rewired.edges = rewired.edges.filter(e => !(e.source === 0 && e.target === 1));
  rewired.edges.push({ source: 0, target: 2, id: 's0_t2', htmlID: 's0_t2' });
  const diff = structuralDiff(base(), rewired);
  expect(diff.identical).toBe(false);
  expect(diff.addedEdges).toEqual([{ source: '0', target: '2' }]);
  expect(diff.removedEdges).toEqual([{ source: '0', target: '1' }]);
});

logicTest('structuralDiff: composite grouping is annotation — leaves diff flat', ({ expect }) => {
  const grouped = base();
  const dense = grouped.layers[1]!;
  dense.parentID = 10;
  grouped.layers = [
    grouped.layers[0]!,
    {
      class: 'Group', id: 10, htmlID: 'layer-10', name: 'Block', x: 0, y: 0,
      inputLayers: [], outputLayers: [], children: [dense], kerasLayer: null, parentID: null,
    },
    grouped.layers[2]!,
  ];
  expect(structuralDiff(base(), grouped).identical).toBe(true);
});
