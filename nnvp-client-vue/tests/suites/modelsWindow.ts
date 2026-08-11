/**
 * The Models window (Phase G3): the architecture story OUTSIDE the Training
 * zone — timeline list, evolution graph from recorded parentage, read-only
 * preview with prev/next that never touch the board, and one explicit
 * "Load this state" restore. Driven through world.models in both worlds.
 */
import { appTest } from '../harness/define';
import type { StoredDomainEvent } from '../../src/lib/Events/domainEvent';
import type { KerasLayerJSON } from '../../src/types/model';

const kl = (name: string, parameterValues: Record<string, unknown> = {}): KerasLayerJSON => ({
  name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues, customUserLayer: false,
} as unknown as KerasLayerJSON);

function smallGraph(units: number): string {
  return JSON.stringify({
    formatVersion: 2,
    layers: [
      {
        class: 'Layer', id: 0, htmlID: 'layer-0', name: 'Input', x: 0, y: 0, width: 90, height: 40,
        inputLayers: [], outputLayers: [1], children: null, kerasLayer: kl('Input', { shape: [4] }), parentID: null,
      },
      {
        class: 'Layer', id: 1, htmlID: 'layer-1', name: 'Dense', x: 140, y: 0, width: 90, height: 40,
        inputLayers: [0], outputLayers: [], children: null, kerasLayer: kl('Dense', { units }), parentID: null,
      },
    ],
    edges: [{ source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' }],
    inputs: [0],
    outputs: [1],
  });
}

/** One graph.checkpoint event ready for records.seed('events', …). */
function checkpointEvent(
  uuid: string, wallTime: string, graphJson: string, parent: string | null,
): StoredDomainEvent {
  return {
    uuid,
    type: 'graph.checkpoint',
    streamId: null,
    deviceId: 'device-a',
    instanceId: 'instance-1',
    seq: Number(uuid.replace(/\D/g, '')) || 1,
    dependsOn: [],
    wallTime,
    payload: { graphJson, parent },
  } as StoredDomainEvent;
}

appTest('modelsWindow: checkpoints feed the timeline and the evolution graph', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-1', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
  ]);
  await models.open();
  const text = await models.text();
  expect(text).toContain('Input → Dense');
  await models.showGraph();
  expect(await models.nodeCount()).toBe(1);
});

appTest('modelsWindow: prev/next move the preview, never the board; Load restores once', async ({ models, board, records, expect }) => {
  // A recorded chain: 8 units, then a fork to 32 (parent unknown here — the
  // seeded parent hash matters only for edges, not for this test's loading).
  await records.seed('events', [
    checkpointEvent('cp-1', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-2', '2026-08-01T11:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  await models.showGraph();
  expect(await models.nodeCount()).toBe(2);
  await models.select(0);
  expect(await models.previewBoxCount()).toBe(2); // Input + Dense drawn read-only
  expect(await board.layerCount()).toBe(0); // selection never touched the board
  await models.next();
  expect(await board.layerCount()).toBe(0); // neither do the arrows
  await models.loadSelected();
  expect(await board.layerCount()).toBe(2); // ONE explicit restore did
});

appTest('modelsWindow: the shared filter bar narrows both views by date', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-old', '2026-07-01T12:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-new', '2026-07-20T12:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  let text = await models.text();
  expect(text).toContain('2026-07-01'); // absolute grid column, YYYY-MM-DD HH:MM
  expect(text).toContain('2026-07-20');
  await models.setFilter('from', '2026-07-10');
  text = await models.text();
  expect(text).not.toContain('2026-07-01'); // filtered out of the timeline
  expect(text).toContain('2026-07-20');
  // The SAME bar rules the graph view.
  await models.showGraph();
  expect(await models.nodeCount()).toBe(1);
  await models.setFilter('from', '');
  expect(await models.nodeCount()).toBe(2);
});

appTest('modelsWindow: human dates and the first/last iteration setting', async ({ models, records, expect }) => {
  // ONE architecture, two iterations far apart.
  await records.seed('events', [
    checkpointEvent('cp-i1', '2026-07-01T12:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-i2', '2026-07-15T12:00:00.000Z', smallGraph(8), null),
  ]);
  await models.open();
  let text = await models.text();
  expect(text).toContain('2026-07-01'); // default: the FIRST iteration's stamp
  expect(text).not.toContain('2026-07-15');
  await models.setFilter('seen', 'last');
  text = await models.text();
  expect(text).toContain('2026-07-15'); // now the latest iteration speaks
  expect(text).not.toContain('2026-07-01');
  await models.setFilter('when', 'relative');
  expect(await models.text()).toContain('ago'); // "N days ago" mode
});

appTest('modelsWindow: newest-first by default, the order button inverts both views', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-old', '2026-07-01T12:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-new', '2026-07-20T12:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  let text = await models.text();
  expect(text.indexOf('2026-07-20')).toBeLessThan(text.indexOf('2026-07-01')); // latest leads
  await models.toggleOrder();
  text = await models.text();
  expect(text.indexOf('2026-07-01')).toBeLessThan(text.indexOf('2026-07-20')); // inverted
  // The same setting rules the graph view.
  await models.showGraph();
  expect(await models.nodeCount()).toBe(2);
});

appTest('modelsWindow: the Map tab lays states out as a real graph with thumbnails', async ({ models, board, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-1', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-2', '2026-08-01T11:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  await models.showMap();
  expect(await models.mapNodeCount()).toBe(2);
  // Cards carry an in-node thumbnail of the architecture (boxes, not text).
  expect(await models.mapThumbBoxCount()).toBeGreaterThanOrEqual(4); // 2 layers × 2 states
  // Same selection/detail contract as the lane view: click → preview + Load.
  await models.selectMapNode(0);
  expect(await models.previewBoxCount()).toBe(2);
  expect(await board.layerCount()).toBe(0); // selection still never loads
  await models.loadSelected();
  expect(await board.layerCount()).toBe(2);
});

appTest('modelsWindow: the rating slider records a claim and ranks derive across models', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-a', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-b', '2026-08-01T11:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  await models.showGraph();
  await models.select(0);
  await models.rate(800);
  await models.select(1);
  await models.rate(400);
  // Each slide is a stored model.rated claim (syncs like everything else)…
  const events = await records.list<{ uuid: string; type: string }>('events');
  expect(events.filter(event => event.type === 'model.rated').length).toBe(2);
  // …the claims read back verbatim with derived ranks, in every view.
  const text = await models.text();
  expect(text).toContain('★ 800 (#1/2)');
  expect(text).toContain('★ 400 (#2/2)');
  // Re-rating replaces, never accumulates.
  await models.rate(900);
  expect(await models.text()).toContain('★ 900 (#1/2)');
});

appTest('modelsWindow: the Map zoom ladder — cards, then dots, then cluster blobs', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-1', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-2', '2026-08-01T11:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  await models.showMap();
  expect(await models.mapThumbBoxCount()).toBeGreaterThan(0); // cards up close
  await models.mapZoom(460); // one level out: weighted dots
  expect(await models.mapThumbBoxCount()).toBe(0);
  expect(await models.mapNodeCount()).toBe(2);
  await models.mapZoom(1400); // all the way out: coarsened blobs
  const clusters = await models.mapClusterCount();
  expect(clusters).toBeGreaterThanOrEqual(1);
  expect(clusters).toBeLessThanOrEqual(2);
  await models.mapZoom(-2200); // and back to the cards
  expect(await models.mapThumbBoxCount()).toBeGreaterThan(0);
});

appTest('modelsWindow: recursive folders — navigate, save-as, hard links everywhere', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-a', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
    checkpointEvent('cp-b', '2026-08-01T11:00:00.000Z', smallGraph(32), null),
  ]);
  await models.open();
  await models.showGraph();
  await models.select(0);
  await models.favoriteSelected(); // ★ → a link in /favorites
  await models.openFiles();
  expect(await models.filesText()).toContain('favorites'); // a subfolder at root
  // Build a NESTED path by navigating: /experiments/convnets.
  await models.newFolder('experiments');
  await models.openFolder('experiments');
  await models.newFolder('convnets');
  await models.openFolder('convnets');
  expect(await models.filesText()).toContain('experiments'); // the breadcrumb
  expect(await models.filesText()).toContain('convnets');
  // The Save-As flow: pick the model, browse here, save.
  await models.showGraph();
  await models.select(0);
  await models.startSaveTo(); // Files opens in saving mode, path preserved
  expect(await models.filesText()).toContain('Saving');
  await models.saveHere();
  let text = await models.filesText();
  expect(text).toContain('Input → Dense'); // linked in /experiments/convnets
  // The same model also lives in /favorites (unix hard links).
  await models.filesUp();
  await models.filesUp();
  await models.openFolder('favorites');
  text = await models.filesText();
  expect(text).toContain('Input → Dense');
  // Deleting here (select → Delete → confirm) leaves the convnets link alone.
  await models.selectEntry(0);
  await models.deleteSelected();
  expect(await models.filesText()).toContain('Delete 1 item'); // the modal asks first
  await models.confirmDialog();
  expect(await models.filesText()).not.toContain('Input → Dense');
  const events = await records.list<{ uuid: string; type: string }>('events');
  expect(events.some(event => event.type === 'folder.linked')).toBe(true);
  expect(events.some(event => event.type === 'folder.created')).toBe(true);
});

appTest('modelsWindow: the detail strip shows every folder holding the model; Files loads restore', async ({ models, board, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-a', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
  ]);
  await models.open();
  await models.showGraph();
  await models.select(0);
  await models.favoriteSelected();
  // The reverse lookup, in place: "where else is this saved?"
  expect(await models.text()).toContain('in: /favorites');
  await models.openFiles();
  await models.openFolder('favorites');
  expect(await board.layerCount()).toBe(0);
  await models.fileLoad(0); // the one board mutation, undoable as ever
  expect(await board.layerCount()).toBe(2);
});

appTest('modelsWindow: file-manager grammar — copy/cut/paste and rename re-point links', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-a', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
  ]);
  await models.open();
  await models.showGraph();
  await models.select(0);
  await models.favoriteSelected(); // a link in /favorites to work with
  await models.openFiles();
  await models.newFolder('projects');
  // COPY: a paste is just another hard link.
  await models.openFolder('favorites');
  await models.selectEntry(0);
  await models.copySelected();
  await models.filesUp();
  await models.openFolder('projects');
  await models.paste();
  expect(await models.filesText()).toContain('Input → Dense');
  await models.filesUp();
  await models.openFolder('favorites');
  expect(await models.filesText()).toContain('Input → Dense'); // original survives a copy
  // CUT: the move variant — the origin link goes.
  await models.selectEntry(0);
  await models.cutSelected();
  await models.filesUp();
  await models.openFolder('projects');
  await models.paste(); // already linked here: harmless, but favorites empties
  await models.filesUp();
  // The cut emptied /favorites — and being link-implied (★ never emits
  // folder.created), the folder itself rightly vanishes from the tree.
  expect(await models.filesText()).not.toContain('favorites');
  // RENAME: the folder moves, its links follow (reverse lookup agrees).
  await models.selectFolder('projects');
  await models.renameSelected('archive');
  const text = await models.filesText();
  expect(text).toContain('archive');
  expect(text).not.toContain('projects');
  await models.showGraph();
  await models.select(0);
  expect(await models.text()).toContain('in: /archive');
});

appTest('modelsWindow: Drive-style history — the arrows retrace your navigation', async ({ models, records, expect }) => {
  await records.seed('events', [
    checkpointEvent('cp-a', '2026-08-01T10:00:00.000Z', smallGraph(8), null),
  ]);
  await models.open();
  await models.showGraph();
  await models.select(0);
  await models.favoriteSelected();
  await models.openFiles();
  await models.openFolder('favorites');
  expect(await models.filesText()).toContain('Input → Dense'); // inside
  await models.filesBack();
  expect(await models.filesText()).not.toContain('Input → Dense'); // back at root
  expect(await models.filesText()).toContain('favorites');
  await models.filesForward();
  expect(await models.filesText()).toContain('Input → Dense'); // forward again
});
