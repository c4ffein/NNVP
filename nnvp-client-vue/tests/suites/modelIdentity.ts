/**
 * Two-tier model identity (Phase F): workHash = the computation alone,
 * docHash = computation + annotations (names, comments, grouping). Both are
 * pure functions of the NnvpModel JSON — nothing here touches the board.
 */
import { logicTest } from '../harness/define';
import { modelIdentityOf, archSummary } from '../../src/lib/Training/modelIdentity';
import type { KerasLayerJSON, NnvpLayer, NnvpModel } from '../../src/types/model';

const kl = (name: string, parameterValues: Record<string, unknown> = {}): KerasLayerJSON => ({
  name, category: 'test', parameterDef: {}, parameterValues, customUserLayer: false,
} as unknown as KerasLayerJSON);

const layer = (
  id: number,
  type: string,
  params: Record<string, unknown> = {},
  extra: Partial<NnvpLayer> = {},
): NnvpLayer => ({
  class: 'Layer', id, htmlID: `layer-${id}`, name: type, x: 10 * id, y: 20,
  inputLayers: [], outputLayers: [], children: null,
  kerasLayer: kl(type, params), parentID: null,
  ...extra,
});

/** Input -> Dense(4) -> Dense(2) -> Output, the suite's base architecture. */
const baseModel = (): NnvpModel => ({
  formatVersion: 2,
  layers: [
    layer(0, 'Input', { shape: [8] }),
    layer(1, 'Dense', { units: 4 }),
    layer(2, 'Dense', { units: 2 }),
    layer(3, 'Output'),
  ],
  edges: [
    { source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' },
    { source: 1, target: 2, id: 's1_t2', htmlID: 's1_t2' },
    { source: 2, target: 3, id: 's2_t3', htmlID: 's2_t3' },
  ],
  inputs: [0],
  outputs: [2],
});

logicTest('modelIdentity: hashes are deterministic and uuid-shaped', async ({ expect }) => {
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(JSON.stringify(baseModel())))!;
  expect(a.workHash).toBe(b.workHash);
  expect(a.docHash).toBe(b.docHash);
  expect(a.workHash).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

logicTest('modelIdentity: position-only changes leave BOTH hashes alone', async ({ expect }) => {
  const moved = baseModel();
  moved.layers.forEach((l) => { l.x += 500; l.y -= 40; l.width = 200; l.height = 90; });
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(moved))!;
  expect(b.workHash).toBe(a.workHash);
  expect(b.docHash).toBe(a.docHash);
});

logicTest('modelIdentity: a rename changes docHash but never workHash', async ({ expect }) => {
  const renamed = baseModel();
  renamed.layers[1]!.name = 'encoder';
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(renamed))!;
  expect(b.workHash).toBe(a.workHash);
  expect(b.docHash).not.toBe(a.docHash);
});

logicTest('modelIdentity: a comment changes docHash but never workHash', async ({ expect }) => {
  const commented = baseModel();
  commented.layers[2]!.comment = 'the bottleneck';
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(commented))!;
  expect(b.workHash).toBe(a.workHash);
  expect(b.docHash).not.toBe(a.docHash);
});

logicTest('modelIdentity: a parameter change changes workHash', async ({ expect }) => {
  const tweaked = baseModel();
  tweaked.layers[1]!.kerasLayer!.parameterValues.units = 128;
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(tweaked))!;
  expect(b.workHash).not.toBe(a.workHash);
});

logicTest('modelIdentity: rewiring changes workHash', async ({ expect }) => {
  const rewired = baseModel();
  rewired.edges = rewired.edges.filter(e => !(e.source === 1 && e.target === 2));
  rewired.edges.push({ source: 0, target: 2, id: 's0_t2', htmlID: 's0_t2' });
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(rewired))!;
  expect(b.workHash).not.toBe(a.workHash);
});

logicTest('modelIdentity: explicit unrollSteps 3 hashes like the absent default; other counts differ', async ({ expect }) => {
  const explicit = baseModel();
  explicit.edges[1]!.unrollSteps = 3;
  const seven = baseModel();
  seven.edges[1]!.unrollSteps = 7;
  const a = (await modelIdentityOf(baseModel()))!;
  expect((await modelIdentityOf(explicit))!.workHash).toBe(a.workHash);
  expect((await modelIdentityOf(seven))!.workHash).not.toBe(a.workHash);
});

logicTest('modelIdentity: grouping layers into a composite is annotation, not computation', async ({ expect }) => {
  const grouped = baseModel();
  const [input, d1, d2, output] = grouped.layers as [NnvpLayer, NnvpLayer, NnvpLayer, NnvpLayer];
  d1.parentID = 10;
  d2.parentID = 10;
  grouped.layers = [
    input,
    {
      class: 'Group', id: 10, htmlID: 'layer-10', name: 'Block_10', x: 5, y: 5,
      width: 300, height: 120, inputLayers: [], outputLayers: [],
      children: [d1, d2], kerasLayer: null, parentID: null,
    },
    output,
  ];
  const a = (await modelIdentityOf(baseModel()))!;
  const b = (await modelIdentityOf(grouped))!;
  expect(b.workHash).toBe(a.workHash);
  expect(b.docHash).not.toBe(a.docHash); // the group's name is an annotation
});

logicTest('modelIdentity: unparseable input yields null instead of throwing', async ({ expect }) => {
  expect(await modelIdentityOf('{not json')).toBeNull();
  expect(await modelIdentityOf('null')).toBeNull();
});

logicTest('modelIdentity: archSummary compresses consecutive same-type layers', ({ expect }) => {
  expect(archSummary(baseModel())).toBe('Input → Dense×2 → Output');
  const single = baseModel();
  single.layers = single.layers.slice(0, 2);
  expect(archSummary(single)).toBe('Input → Dense');
});

logicTest('modelIdentity: archSummary marks branching and feedback topologies', ({ expect }) => {
  // Linear models stay untouched (pinned above); non-linear ones get markers.
  const merged = baseModel();
  merged.edges.push({ source: 0, target: 2, id: 's0_t2', htmlID: 's0_t2' }); // skip: 0 feeds 1 AND 2
  expect(archSummary(merged)).toContain('⋔');
  expect(archSummary(merged)).not.toContain('⟲');
  const cyclic = baseModel();
  cyclic.edges.push({ source: 2, target: 1, id: 's2_t1', htmlID: 's2_t1', unrollSteps: 3 });
  expect(archSummary(cyclic)).toContain('⟲');
  expect(archSummary(baseModel())).toBe('Input → Dense×2 → Output'); // no markers on chains
});
