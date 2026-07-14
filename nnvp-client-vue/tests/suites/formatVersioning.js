/**
 * Save-format versioning (src/lib/ModelFormat/migrations.ts). The .nnvp JSON
 * now carries `formatVersion`; files without it — every file saved before
 * versioning existed, D3-era saves and the shipped templates included — read
 * as version 1 and must stay loadable forever. Files stamped by a NEWER NNVP
 * are refused with a clear error instead of loading garbage.
 */
import { appTest, logicTest } from '../harness/define';
import BoardTemplates from '../../src/lib/BoardInterface/BoardTemplates';
import {
  CURRENT_FORMAT_VERSION, MIGRATIONS, FormatVersionError, migrateModel,
} from '../../src/lib/ModelFormat/migrations';
import { nnvpToFlow, flowToNnvp } from '../../src/lib/FlowInterface/adapter';

// A minimal, valid, UNVERSIONED model — what every pre-versioning save (and
// D3-era file) looks like on disk.
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

const emptyModel = () => ({
  layers: [], edges: [], inputs: [], outputs: [],
});

logicTest('formatVersioning: the production ladder is empty — the current format IS version 1', ({ expect }) => {
  expect(MIGRATIONS.length).toBe(0);
  expect(CURRENT_FORMAT_VERSION).toBe(1);
});

logicTest('formatVersioning: unversioned legacy JSON reads as version 1 and round-trips stamped', ({ expect }) => {
  const migrated = migrateModel(legacyModel());
  expect(migrated.formatVersion).toBe(CURRENT_FORMAT_VERSION);
  expect(migrated.layers[0].kerasLayer.parameterValues.units).toBe(7);
  // Through the real load/save seam: load the legacy file, save it back.
  const { nodes, edges } = nnvpToFlow(legacyModel());
  expect(JSON.parse(flowToNnvp(nodes, edges)))
    .toEqual({ ...JSON.parse(legacyModel()), formatVersion: CURRENT_FORMAT_VERSION });
});

logicTest('formatVersioning: migrateModel never mutates its input', ({ expect }) => {
  const input = JSON.parse(legacyModel());
  migrateModel(input);
  expect(input.formatVersion).toBeUndefined();
});

logicTest('formatVersioning: a file from a newer NNVP is refused with a clear error', ({ expect }) => {
  const future = JSON.stringify({ ...emptyModel(), formatVersion: CURRENT_FORMAT_VERSION + 1 });
  let error = null;
  try { migrateModel(future); } catch (e) { error = e; }
  expect(error).toBeInstanceOf(FormatVersionError);
  expect(error.message).toContain('made with a newer version of NNVP');
  // And through the load seam every entry point (file / template / cloud) uses.
  let loadError = null;
  try { nnvpToFlow(future); } catch (e) { loadError = e; }
  expect(loadError).toBeInstanceOf(FormatVersionError);
});

logicTest('formatVersioning: the ladder applies migrations in order, starting at the file version', ({ expect }) => {
  // Dummy ladder (tests only — the production MIGRATIONS list stays empty):
  // version 1 -> 2 -> 3, each step leaving its mark in order.
  const ladder = [
    model => ({ ...model, trail: [...(model.trail || []), '1->2'] }),
    model => ({ ...model, trail: [...(model.trail || []), '2->3'] }),
  ];
  const fromLegacy = migrateModel(JSON.stringify(emptyModel()), ladder);
  expect(fromLegacy.trail).toEqual(['1->2', '2->3']);
  expect(fromLegacy.formatVersion).toBe(3);
  // A version-2 file only takes the remaining step.
  const fromMid = migrateModel({ ...emptyModel(), formatVersion: 2 }, ladder);
  expect(fromMid.trail).toEqual(['2->3']);
  // An already-current file takes none.
  const current = migrateModel({ ...emptyModel(), formatVersion: 3, trail: ['saved'] }, ladder);
  expect(current.trail).toEqual(['saved']);
  // Newer than the ladder reaches: refused, even mid-ladder.
  let error = null;
  try { migrateModel({ ...emptyModel(), formatVersion: 4 }, ladder); } catch (e) { error = e; }
  expect(error).toBeInstanceOf(FormatVersionError);
});

logicTest('formatVersioning: every shipped template is an unversioned legacy file and still loads', ({ expect }) => {
  const boardTemplates = new BoardTemplates();
  boardTemplates.list().forEach((name) => {
    // Pinned: templates predate versioning — they must keep reading as v1.
    expect(JSON.parse(boardTemplates.get(name)).formatVersion).toBeUndefined();
    const { nodes } = nnvpToFlow(boardTemplates.get(name));
    expect(nodes.length).toBeGreaterThan(0);
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

appTest('formatVersioning: a legacy unversioned file loads on the board and re-saves stamped', async ({ board, expect }) => {
  await board.loadJSON(legacyModel());
  expect(await board.layerCount()).toBe(1);
  expect(await board.layerLabels()).toContain('Dense');
  expect(JSON.parse(await board.graphJSON()))
    .toEqual({ ...JSON.parse(legacyModel()), formatVersion: CURRENT_FORMAT_VERSION });
});
