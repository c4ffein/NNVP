/**
 * Save-format versioning (src/lib/ModelFormat/migrations.ts). The .nnvp JSON
 * carries `formatVersion`; files without it — every file saved before
 * versioning existed, D3-era saves and the originally shipped templates
 * included — read as version 1 and must stay loadable forever. Version 2
 * renamed the D3-flavored spellings (class "D3Layer"/"D3LayerComposite" ->
 * "Layer"/"Group", htmlID "d3-layer-N" -> "layer-N"); the 1->2 migration is
 * pinned here against the real v1 template files captured before the rename.
 * Files stamped by a NEWER NNVP are refused with a clear error instead of
 * loading garbage.
 */
import { appTest, logicTest } from '../harness/define';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import v1Templates from './fixtures/v1Templates';
import {
  CURRENT_FORMAT_VERSION, MIGRATIONS, FormatVersionError, migrateModel,
} from '../../src/lib/ModelFormat/migrations';
import { nnvpToFlow, flowToNnvp } from '../../src/lib/FlowInterface/adapter';
import type { NnvpModel } from '../../src/types/model';

// A minimal, valid, UNVERSIONED v1 model — what every pre-versioning save
// (and D3-era file) looks like on disk, v1 spellings included.
const legacyModel = () => JSON.stringify({
  layers: [{
    class: 'D3Layer', x: 20, y: 30, width: 90, height: 40, id: 0, htmlID: 'd3-layer-0',
    name: 'Dense', inputLayers: [], outputLayers: [], children: null,
    kerasLayer: {
      name: 'Dense', category: 'Core', searchTerms: [], parameterDef: {},
      parameterValues: { units: 7 }, customUserLayer: false,
    },
    parentID: null,
  }],
  edges: [],
  inputs: [],
  outputs: [],
});

// The same graph in v2 spelling — what migrating legacyModel must produce.
const legacyModelMigrated = () => ({
  ...JSON.parse(legacyModel()),
  layers: [{
    ...JSON.parse(legacyModel()).layers[0],
    class: 'Layer',
    htmlID: 'layer-0',
  }],
  formatVersion: CURRENT_FORMAT_VERSION,
});

// A v1 file with a composite (grouped) layer: the rename must recurse into
// children, and composite htmlIDs ("Composite_5") must pass through untouched.
const legacyComposite = () => JSON.stringify({
  layers: [{
    class: 'D3LayerComposite', x: 10, y: 10, width: 200, height: 100, id: 5,
    htmlID: 'Composite_5', name: 'Block_5', inputLayers: [], outputLayers: [],
    children: [{
      class: 'D3Layer', x: 20, y: 30, width: 90, height: 40, id: 0, htmlID: 'd3-layer-0',
      name: 'Dense', inputLayers: [], outputLayers: [], children: null,
      kerasLayer: null, parentID: 5,
    }],
    kerasLayer: null, parentID: null,
  }],
  edges: [],
  inputs: [],
  outputs: [],
});

const emptyModel = (): NnvpModel => ({
  layers: [], edges: [], inputs: [], outputs: [],
});

// The dummy-ladder test tracks each applied step in a `trail` property the
// persisted format does not know about.
type TrailModel = NnvpModel & { trail?: string[] };

logicTest('formatVersioning: the ladder holds the 1->2 rename — current format is version 2', ({ expect }) => {
  expect(MIGRATIONS.length).toBe(1);
  expect(CURRENT_FORMAT_VERSION).toBe(2);
});

logicTest('formatVersioning: unversioned legacy JSON migrates to v2 names and round-trips stamped', ({ expect }) => {
  const migrated = migrateModel(legacyModel());
  expect(migrated).toEqual(legacyModelMigrated());
  expect(migrated.layers[0]!.kerasLayer!.parameterValues.units).toBe(7);
  // Through the real load/save seam: load the legacy file, save it back.
  const { nodes, edges } = nnvpToFlow(legacyModel());
  expect(JSON.parse(flowToNnvp(nodes, edges))).toEqual(legacyModelMigrated());
});

logicTest('formatVersioning: the 1->2 rename recurses into composite children and leaves other htmlIDs alone', ({ expect }) => {
  const migrated = migrateModel(legacyComposite());
  const composite = migrated.layers[0]!;
  expect(composite.class).toBe('Group');
  expect(composite.htmlID).toBe('Composite_5'); // not d3-flavored: untouched
  expect(composite.children![0]!.class).toBe('Layer');
  expect(composite.children![0]!.htmlID).toBe('layer-0');
});

logicTest('formatVersioning: migrating an already-v2 model changes nothing', ({ expect }) => {
  const saved = JSON.stringify(legacyModelMigrated());
  expect(migrateModel(saved)).toEqual(JSON.parse(saved));
});

logicTest('formatVersioning: migrateModel never mutates its input', ({ expect }) => {
  const input: NnvpModel = JSON.parse(legacyModel());
  migrateModel(input);
  expect(input.formatVersion).toBeUndefined();
  // The 1->2 rename builds new layer objects instead of touching the parse.
  expect(input.layers[0]!.class as string).toBe('D3Layer');
  expect(input.layers[0]!.htmlID).toBe('d3-layer-0');
});

logicTest('formatVersioning: a file from a newer NNVP is refused with a clear error', ({ expect }) => {
  const future = JSON.stringify({ ...emptyModel(), formatVersion: CURRENT_FORMAT_VERSION + 1 });
  let error: Error | null = null;
  try { migrateModel(future); } catch (e) { error = e as Error; }
  expect(error).toBeInstanceOf(FormatVersionError);
  expect(error!.message).toContain('made with a newer version of NNVP');
  // And through the load seam every entry point (file / template / cloud) uses.
  let loadError: Error | null = null;
  try { nnvpToFlow(future); } catch (e) { loadError = e as Error; }
  expect(loadError).toBeInstanceOf(FormatVersionError);
});

logicTest('formatVersioning: the ladder applies migrations in order, starting at the file version', ({ expect }) => {
  // Dummy ladder (tests only — independent of the production MIGRATIONS):
  // version 1 -> 2 -> 3, each step leaving its mark in order.
  const ladder = [
    (model: TrailModel): TrailModel => ({ ...model, trail: [...(model.trail || []), '1->2'] }),
    (model: TrailModel): TrailModel => ({ ...model, trail: [...(model.trail || []), '2->3'] }),
  ];
  const fromLegacy = migrateModel(JSON.stringify(emptyModel()), ladder) as TrailModel;
  expect(fromLegacy.trail).toEqual(['1->2', '2->3']);
  expect(fromLegacy.formatVersion).toBe(3);
  // A version-2 file only takes the remaining step.
  const fromMid = migrateModel({ ...emptyModel(), formatVersion: 2 }, ladder) as TrailModel;
  expect(fromMid.trail).toEqual(['2->3']);
  // An already-current file takes none.
  const alreadyCurrent: TrailModel = { ...emptyModel(), formatVersion: 3, trail: ['saved'] };
  const current = migrateModel(alreadyCurrent, ladder) as TrailModel;
  expect(current.trail).toEqual(['saved']);
  // Newer than the ladder reaches: refused, even mid-ladder.
  let error: Error | null = null;
  try { migrateModel({ ...emptyModel(), formatVersion: 4 }, ladder); } catch (e) { error = e as Error; }
  expect(error).toBeInstanceOf(FormatVersionError);
});

logicTest('formatVersioning: every captured v1 template migrates to exactly the shipped v2 template', ({ expect }) => {
  const boardTemplates = new BoardTemplates();
  // Templates born AFTER format v2 shipped have no v1 capture by definition —
  // this list is the explicit record of them (currently only the Phase D2
  // Elman flagship). Every template that predates v2 must have its v1 bytes
  // pinned here forever.
  const bornInV2 = ['Elman char-RNN'];
  expect(Object.keys(v1Templates).sort())
    .toEqual(boardTemplates.list().filter(name => !bornInV2.includes(name)).sort());
  bornInV2.forEach(name => expect(boardTemplates.get(name)).toBeTruthy());
  Object.entries(v1Templates).forEach(([name, v1]) => {
    // The captured file really is v1: unversioned, D3-flavored spellings.
    expect(JSON.parse(v1).formatVersion).toBeUndefined();
    expect(v1).toContain('"class":"D3Layer"');
    expect(v1).toContain('"htmlID":"d3-layer-');
    // Migrating it yields the shipped v2 template, byte-for-byte through the
    // real load->save seam (the seam the app itself uses).
    const { nodes, edges } = nnvpToFlow(v1);
    expect(flowToNnvp(nodes, edges)).toBe(boardTemplates.get(name)!);
  });
});

logicTest('formatVersioning: every shipped template is stamped v2, honest-named, and byte-stable through save', ({ expect }) => {
  const boardTemplates = new BoardTemplates();
  boardTemplates.list().forEach((name) => {
    const stored = boardTemplates.get(name)!;
    expect(JSON.parse(stored).formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(stored).not.toContain('D3Layer');
    expect(stored).not.toContain('d3-layer');
    // v2 save -> load -> save is byte-faithful.
    const { nodes, edges } = nnvpToFlow(stored);
    expect(nodes.length).toBeGreaterThan(0);
    expect(flowToNnvp(nodes, edges)).toBe(stored);
  });
});

appTest('formatVersioning: the board stamps saves and reloads its own stamped save', async ({ board, expect }) => {
  await board.loadTemplate('2D Dense for MNIST');
  const saved = await board.graphJSON();
  expect(JSON.parse(saved).formatVersion).toBe(CURRENT_FORMAT_VERSION);
  await board.clearBoard();
  await board.loadJSON(saved);
  expect(await board.layerCount()).toBe(5);
  expect(JSON.parse(await board.graphJSON())).toEqual(JSON.parse(saved));
});

appTest('formatVersioning: a legacy unversioned file loads on the board and re-saves stamped with v2 names', async ({ board, expect }) => {
  await board.loadJSON(legacyModel());
  expect(await board.layerCount()).toBe(1);
  expect(await board.layerLabels()).toContain('Dense');
  expect(JSON.parse(await board.graphJSON())).toEqual(legacyModelMigrated());
});
