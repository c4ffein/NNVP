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
  expect(second).toContain('tinygrad');
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
  // local explosion mints — the fake backend serves them by stream_id).
  await backend.serve({
    events: [
      {
        uuid: 'cloud-evt-newer', type: 'run.hidden', streamId: 'run-newer',
        deviceId: 'other-device', instanceId: 'other-instance', seq: 1,
        dependsOn: [], wallTime: '2026-07-20T11:00:00.000Z', payload: {},
      },
      {
        uuid: 'cloud-evt-older', type: 'run.hidden', streamId: 'run-older',
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
  const cloudUuids = await backend.uuids('events');
  expect(cloudUuids).toEqual(['cloud-evt-older']);
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
