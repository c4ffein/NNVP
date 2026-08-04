/**
 * The Training window's History tab, driven through the whole app: seeded
 * legacy journal records (world.records — they explode into events on first
 * read), the real TrainingZone plumbing — listRuns (folds!) / deleteRun /
 * deleteChoices / restoreRun as the app wires them — and, for the cloud
 * choices, the app's own ApiClient against the world's fake backend
 * (world.backend, /events endpoints). Under bun the drivers mount the real
 * SFCs; in the browser the same calls click Panels > Training.
 *
 * Delete semantics since the event-sourced journal: 'hide' (a reversible
 * run.hidden event — events survive), 'cloud' (purge the stream server-side,
 * survivors flagged localOnly), 'both'.
 */
import { appTest } from '../harness/define';
import type { RunRecord } from '../../src/lib/Training/runJournal';
import type { StoredDomainEvent } from '../../src/lib/Events/domainEvent';

function makeRun(overrides: Partial<RunRecord>): RunRecord {
  return {
    uuid: 'run-0000',
    startedAt: '2026-07-20T10:00:00.000Z',
    finishedAt: '2026-07-20T10:01:00.000Z',
    outcome: 'completed',
    engineId: 'tfjs',
    config: {
      dataset: 'MNIST',
      optimizer: 'rmsprop',
      optimizerParams: {},
      epochs: 5,
      loss: 'categoricalCrossentropy',
    },
    graphJson: '{"layers":[]}',
    epochMetrics: [],
    durationMs: 60000,
    ...overrides,
  };
}

/** The newer, completed run — 3 of 5 epochs journaled, full metrics. */
function newerRun(): RunRecord {
  return makeRun({
    uuid: 'run-newer',
    startedAt: '2026-07-20T10:00:00.000Z',
    epochMetrics: [
      { epoch: 1, acc: 0.52, loss: 1.31, valAcc: 0.5, valLoss: 1.4 },
      { epoch: 2, acc: 0.78, loss: 0.61, valAcc: 0.74, valLoss: 0.7 },
      { epoch: 3, acc: 0.91, loss: 0.235, valAcc: 0.88, valLoss: 0.31 },
    ],
  });
}

/** The older, errored run — no epochs made it into the journal. */
function olderRun(): RunRecord {
  return makeRun({
    uuid: 'run-older',
    startedAt: '2026-07-19T09:00:00.000Z',
    outcome: 'error',
    error: 'boom',
    engineId: 'tinygrad',
    config: {
      dataset: 'Fashion MNIST',
      optimizer: 'sgd',
      optimizerParams: { learningRate: 0.01 },
      epochs: 10,
      loss: 'categoricalCrossentropy',
    },
    epochMetrics: [],
  });
}

appTest('historyPanel: lists runs newest-first with formatted metrics', async ({ history, records, expect }) => {
  // Deliberately oldest-first: the panel must impose newest-first itself.
  await records.seed('runs', [olderRun(), newerRun()]);
  await history.open();
  expect(await history.rowCount()).toBe(2);
  const first = await history.rowText(0);
  expect(first).toContain('MNIST');
  expect(first).toContain('tfjs');
  expect(first).toContain('completed');
  expect(first).toContain('3 / 5'); // epochs done / planned
  expect(first).toContain('0.91'); // final acc, 2 digits
  expect(first).toContain('0.235'); // final loss, 3 digits
  const second = await history.rowText(1);
  expect(second).toContain('Fashion MNIST');
  // Phase F: the raw engineId moved to the detail expand; the row shows the
  // derived provenance columns ('tinygrad' the engine = the tinyloop binder).
  expect(second).toContain('tinyloop');
  expect(second).toContain('error');
  expect(second).toContain('0 / 10');
  expect(second).toContain('—'); // no epoch metrics → both cells em-dashed
});

appTest('historyPanel: a legacy stale-running record shows last-event, never "running"', async ({ history, records, expect }) => {
  // THE bug this refactor kills: a run frozen as outcome:'running'. Its fold
  // has no finish event, so the row must show when the stream last spoke —
  // the word 'running' must be gone from the outcome column forever.
  await records.seed('runs', [makeRun({
    uuid: 'run-stale',
    outcome: 'running',
    finishedAt: undefined,
    durationMs: undefined,
    startedAt: '2026-07-01T08:00:00.000Z', // weeks old: stale by any threshold
  })]);
  await history.open();
  expect(await history.rowCount()).toBe(1);
  const row = await history.rowText(0);
  expect(row).not.toContain('running');
  expect(row).toContain('last event');
});

appTest('historyPanel: View expands the row and shows the training curves', async ({ history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  await history.open();
  expect(await history.curvesVisible()).toBe(false);
  await history.view(0);
  expect(await history.curvesVisible()).toBe(true);
  // The record's epochMetrics rendered as the epoch chart: real SVG lines,
  // one per journaled series (acc, val-acc, loss, val-loss).
  expect(await history.curveSeriesCount()).toBe(4);
  expect(await history.curvesText()).toContain('Epoch Results');
  // View toggles back off.
  await history.view(0);
  expect(await history.curvesVisible()).toBe(false);
});

appTest('historyPanel: Restore loads the graph and compile options back into the app', async ({ board, history, training, records, expect }) => {
  // A real graph, journaled the way a run would snapshot it.
  await board.addLayer('Dense');
  const graphJson = await board.graphJSON();
  await records.seed('runs', [makeRun({
    uuid: 'run-restore',
    graphJson,
    config: {
      dataset: 'MNIST', optimizer: 'adamax', optimizerParams: {}, epochs: 7,
      loss: 'categoricalCrossentropy',
    },
  })]);
  await board.clearBoard();
  expect(await board.layerCount()).toBe(0);

  await history.open();
  await history.restore(0);
  // The graph is back on the board...
  expect(await board.layerCount()).toBe(1);
  expect((await board.layerLabels()).some(label => label && label.includes('Dense'))).toBe(true);
  // ...and the run's compile options are back in the form (both non-default).
  await history.close();
  await training.open();
  expect(await training.optimizer()).toBe('adamax');
  expect(await training.epochs()).toBe(7);
});

appTest('historyPanel: signed out, Delete offers hide+Cancel; Cancel keeps, hide removes the row but keeps the events', async ({ chat, history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  await chat.setSignedIn(false);
  await history.open();
  // Inline confirmation, and only the locations that hold the record:
  // signed out there is no cloud stream to purge — hide is the one offer.
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['hide']);
  // Cancel is a real exit: both rows survive.
  await history.confirmDelete('Cancel');
  expect(await history.rowCount()).toBe(2);
  // Picking hide removes the row — but NOTHING is deleted: the legacy record
  // survives untouched and the run's events (now + run.hidden) are all there.
  await history.requestDelete(0);
  await history.confirmDelete('hide');
  expect(await history.rowCount()).toBe(1);
  expect(await history.rowText(0)).toContain('Fashion MNIST');
  expect((await records.list('runs')).length).toBe(2); // legacy store read-only
  const events = await records.list<StoredDomainEvent & { uuid: string }>('events');
  const hiddenEvents = events.filter(
    event => event.streamId === 'run-newer' && event.type === 'run.hidden',
  );
  expect(hiddenEvents.length).toBe(1);
});

appTest('historyPanel: signed in with no reachable backend degrades to the hide-only prompt', async ({ chat, history, records, expect }) => {
  // The deleteChoices plumbing must swallow the API failure (progressive
  // enhancement) and fall back to the local hide — never throw, never block.
  await records.seed('runs', [newerRun()]);
  await chat.setSignedIn(true);
  await history.open();
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['hide']);
  await history.confirmDelete('Cancel');
  expect(await history.rowCount()).toBe(1);
});

appTest('historyPanel: cloud-held streams offer all three; cloud purges + detaches, both also hides', async ({ backend, chat, history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  // The cloud holds one event of each stream (uuids must differ from what the
  // local explosion mints — the fake backend serves them by stream_id). The
  // type must be a NEUTRAL one (an orphan run.epoch folds harmlessly): both
  // worlds run the app's real sync-on-auth wiring, so these events get pulled
  // into the local store on sign-in — a run.hidden here would hide the very
  // rows this test deletes (the browser half caught exactly that).
  await backend.serve({
    events: [
      {
        uuid: 'cloud-evt-newer', type: 'run.epoch', streamId: 'run-newer',
        deviceId: 'other-device', instanceId: 'other-instance', seq: 1,
        dependsOn: [], wallTime: '2026-07-20T11:00:00.000Z', payload: {},
      },
      {
        uuid: 'cloud-evt-older', type: 'run.epoch', streamId: 'run-older',
        deviceId: 'other-device', instanceId: 'other-instance', seq: 2,
        dependsOn: [], wallTime: '2026-07-20T11:00:00.000Z', payload: {},
      },
    ],
  });
  await chat.setSignedIn(true);
  await history.open();
  // The cloud holds row 0's stream → all three choices, in the offered order.
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['hide', 'cloud', 'both']);
  // A cloud-only purge detaches the local copy but keeps it: the row STAYS,
  // the cloud stream is gone, and the local events are flagged never-push.
  await history.confirmDelete('cloud');
  expect(await history.rowCount()).toBe(2);
  // Sign-in also PUSHED the local exploded events cloudward (the real sync,
  // in flight since setSignedIn) — so assert stream semantics, not the exact
  // set: run-newer's stream is gone from the cloud, run-older's survives.
  const cloudUuids = await backend.uuids('events');
  expect(cloudUuids).toContain('cloud-evt-older');
  expect(cloudUuids).not.toContain('cloud-evt-newer');
  const events = await records.list<StoredDomainEvent & { uuid: string }>('events');
  const newerEvents = events.filter(event => event.streamId === 'run-newer');
  expect(newerEvents.length).toBeGreaterThan(0);
  expect(newerEvents.every(event => event.localOnly === true)).toBe(true);
  // 'both' on the still-cloud-held row purges its stream AND hides the row.
  const offeredOlder = await history.requestDelete(1);
  expect(offeredOlder).toEqual(['hide', 'cloud', 'both']);
  await history.confirmDelete('both');
  expect(await history.rowCount()).toBe(1);
  expect(await history.rowText(0)).toContain('MNIST');
  expect(await backend.uuids('events')).toEqual([]);
  // Hidden, not deleted: run-older's events survive locally, its hidden event
  // is device-private (localOnly) so it can never recreate the purged stream.
  const olderEvents = (await records.list<StoredDomainEvent & { uuid: string }>('events'))
    .filter(event => event.streamId === 'run-older');
  expect(olderEvents.some(event => event.type === 'run.hidden')).toBe(true);
  expect(olderEvents.filter(event => event.type === 'run.hidden')
    .every(event => event.localOnly === true)).toBe(true);
});

appTest('historyPanel: a run that arrived as raw events (synced from another device) folds into a row', async ({ history, records, expect }) => {
  // No RunRecord anywhere: this run exists ONLY as events, the way sync v2
  // delivers another device's training history.
  const base = {
    streamId: 'run-foreign',
    deviceId: 'their-device',
    instanceId: 'their-instance',
    wallTime: '2026-07-21T09:00:00.000Z',
    payload: {} as Record<string, unknown>,
  };
  await records.seed('events', [
    {
      ...base, uuid: 'fe-start', type: 'run.started', seq: 1, dependsOn: [],
      payload: {
        engineId: 'tfjs',
        config: {
          dataset: 'CIFAR-10', optimizer: 'adam', optimizerParams: {}, epochs: 2,
          loss: 'categoricalCrossentropy',
        },
        graphJson: '{"layers":[]}',
      },
    },
    {
      ...base, uuid: 'fe-epoch', type: 'run.epoch', seq: 2, dependsOn: ['fe-start'],
      wallTime: '2026-07-21T09:01:00.000Z', payload: { epoch: 1, acc: 0.66, loss: 0.44 },
    },
    {
      ...base, uuid: 'fe-finish', type: 'run.finished', seq: 3, dependsOn: ['fe-epoch'],
      wallTime: '2026-07-21T09:02:00.000Z', payload: { outcome: 'completed', durationMs: 120000 },
    },
  ] as StoredDomainEvent[]);
  await history.open();
  expect(await history.rowCount()).toBe(1);
  const row = await history.rowText(0);
  expect(row).toContain('CIFAR-10');
  expect(row).toContain('completed');
  expect(row).toContain('1 / 2');
  expect(row).toContain('0.66');
});

appTest('historyPanel: empty journal shows the muted empty line', async ({ history, expect }) => {
  await history.open();
  expect(await history.rowCount()).toBe(0);
  expect(await history.emptyText()).toContain('No training runs recorded yet');
});

// --- Phase F: grouping, filters, provenance, unhide --------------------------

/** A minimal real architecture: Input -> Dense(units) -> Output. The display
 *  name of the Dense layer is annotation-grade — same units, different
 *  `denseName` = same network under another naming (docHash-only change). */
function smallGraph(units: number, denseName = 'Dense'): string {
  const kl = (name: string, parameterValues: Record<string, unknown>) => ({
    name, category: 'test', searchTerms: [], parameterDef: {}, parameterValues, customUserLayer: false,
  });
  return JSON.stringify({
    formatVersion: 2,
    layers: [
      {
        class: 'Layer', id: 0, htmlID: 'layer-0', name: 'Input', x: 0, y: 0,
        inputLayers: [], outputLayers: [1], children: null, kerasLayer: kl('Input', { shape: [4] }), parentID: null,
      },
      {
        class: 'Layer', id: 1, htmlID: 'layer-1', name: denseName, x: 100, y: 0,
        inputLayers: [0], outputLayers: [2], children: null, kerasLayer: kl('Dense', { units }), parentID: null,
      },
      {
        class: 'Layer', id: 2, htmlID: 'layer-2', name: 'Output', x: 200, y: 0,
        inputLayers: [1], outputLayers: [], children: null, kerasLayer: kl('Output', {}), parentID: null,
      },
    ],
    edges: [
      { source: 0, target: 1, id: 's0_t1', htmlID: 's0_t1' },
      { source: 1, target: 2, id: 's1_t2', htmlID: 's1_t2' },
    ],
    inputs: [0],
    outputs: [1],
  });
}

appTest('historyPanel: groups runs by architecture with a skimmable header', async ({ history, records, expect }) => {
  await records.seed('runs', [
    makeRun({ uuid: 'run-a1', startedAt: '2026-07-20T10:00:00.000Z', graphJson: smallGraph(8) }),
    makeRun({ uuid: 'run-a2', startedAt: '2026-07-20T09:00:00.000Z', graphJson: smallGraph(8) }),
    makeRun({ uuid: 'run-b', startedAt: '2026-07-19T10:00:00.000Z', graphJson: smallGraph(32) }),
  ]);
  await history.open();
  const headers = await history.groupHeaders();
  expect(headers.length).toBe(2);
  expect(headers[0]).toContain('Input → Dense → Output');
  expect(headers[0]).toContain('2 runs');
  expect(await history.rowCount()).toBe(3);
});

appTest('historyPanel: derives Ran on / Lib columns from the engine table', async ({ history, records, expect }) => {
  await records.seed('runs', [newerRun()]);
  await history.open();
  const row = await history.rowText(0);
  expect(row).toContain('browser');
  expect(row).toContain('tfjs');
  // Legacy runs recorded no hardware: the cell degrades to the em dash.
  expect(row).toContain('—');
});

appTest('historyPanel: the dataset filter narrows the table to matching runs', async ({ history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  await history.open();
  expect(await history.rowCount()).toBe(2);
  await history.setFilter('dataset', 'MNIST');
  expect(await history.rowCount()).toBe(1);
  expect(await history.rowText(0)).toContain('MNIST');
  await history.setFilter('dataset', '');
  expect(await history.rowCount()).toBe(2);
});

appTest('historyPanel: hidden runs reappear under show-hidden and can be unhidden', async ({ history, records, expect }) => {
  const base = {
    streamId: 'run-hid', deviceId: 'device-a', instanceId: 'instance-1', dependsOn: [] as string[],
  };
  await records.seed('events', [
    {
      ...base, uuid: 'ev-start', type: 'run.started', seq: 1, wallTime: '2026-07-20T10:00:00.000Z',
      payload: {
        engineId: 'tfjs',
        config: {
          dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: {}, epochs: 5,
          loss: 'categoricalCrossentropy',
        },
        graphJson: smallGraph(8),
      },
    },
    {
      ...base, uuid: 'ev-finish', type: 'run.finished', seq: 2, wallTime: '2026-07-20T10:01:00.000Z',
      payload: { outcome: 'completed' },
    },
    {
      ...base, uuid: 'ev-hide', type: 'run.hidden', seq: 3, wallTime: '2026-07-20T10:02:00.000Z',
      payload: {},
    },
  ] as StoredDomainEvent[]);
  await history.open();
  expect(await history.rowCount()).toBe(0); // hidden by default
  await history.setShowHidden(true);
  expect(await history.rowCount()).toBe(1);
  await history.unhide(0);
  await history.setShowHidden(false);
  expect(await history.rowCount()).toBe(1); // unhidden for good
});

appTest('historyPanel: the detail expand shows the recorded hardware fact', async ({ history, records, expect }) => {
  await records.seed('events', [
    {
      streamId: 'run-hw', deviceId: 'device-a', instanceId: 'instance-1', dependsOn: [],
      uuid: 'ev-hw-start', type: 'run.started', seq: 1, wallTime: '2026-07-20T10:00:00.000Z',
      payload: {
        engineId: 'tfjs-worker',
        config: {
          dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: {}, epochs: 5,
          loss: 'categoricalCrossentropy',
        },
        graphJson: smallGraph(8),
        hardware: { backend: 'webgl', cores: 8, gpu: 'Apple M2' },
      },
    },
  ] as StoredDomainEvent[]);
  await history.open();
  await history.view(0);
  const provenance = await history.provenanceText();
  expect(provenance).toContain('tfjs-worker');
  expect(provenance).toContain('webgl');
  expect(provenance).toContain('8 cores');
  expect(provenance).toContain('Apple M2');
});

appTest('historyPanel: Compare overlays the picked runs and diffs only what changed', async ({ history, records, expect }) => {
  await records.seed('runs', [
    makeRun({
      uuid: 'run-cmp-a', startedAt: '2026-07-20T10:00:00.000Z', graphJson: smallGraph(8),
      epochMetrics: [{ epoch: 0, valAcc: 0.5, acc: 0.5, loss: 1 }, { epoch: 1, valAcc: 0.7, acc: 0.7, loss: 0.6 }],
    }),
    makeRun({
      uuid: 'run-cmp-b', startedAt: '2026-07-20T09:00:00.000Z', graphJson: smallGraph(8),
      config: {
        dataset: 'MNIST', optimizer: 'adam', optimizerParams: {}, epochs: 5,
        loss: 'categoricalCrossentropy',
      },
      epochMetrics: [{ epoch: 0, valAcc: 0.6, acc: 0.6, loss: 0.9 }],
    }),
  ]);
  await history.open();
  await history.selectForCompare(0);
  await history.selectForCompare(1);
  await history.compare();
  const text = await history.compareText();
  expect(text).toContain('Identical models');
  expect(text).toContain('optimizer');
  expect(text).toContain('rmsprop');
  expect(text).toContain('adam');
  // Identical config rows are dropped — the shared loss never shows.
  expect(text).not.toContain('categoricalCrossentropy');
  expect(await history.compareSeriesCount()).toBe(2);
});

appTest('historyPanel: Compare tells naming variants apart from real changes', async ({ history, records, expect }) => {
  await records.seed('runs', [
    makeRun({ uuid: 'run-nv-a', startedAt: '2026-07-20T10:00:00.000Z', graphJson: smallGraph(8) }),
    makeRun({ uuid: 'run-nv-b', startedAt: '2026-07-20T09:00:00.000Z', graphJson: smallGraph(8, 'encoder') }),
  ]);
  await history.open();
  await history.selectForCompare(0);
  await history.selectForCompare(1);
  await history.compare();
  expect(await history.compareText()).toContain('Same network — naming/comments differ');
});
