/**
 * The Training window's History tab, driven through the whole app: seeded
 * journal records (world.records), the real TrainingZone plumbing —
 * listRuns/deleteRun/deleteChoices/restoreRun as the app wires them — and,
 * for the cloud-delete choices, the app's own ApiClient against the world's
 * fake backend (world.backend). Under bun the drivers mount the real SFCs;
 * in the browser the same calls click Panels > Training.
 */
import { appTest } from '../harness/define';
import type { RunRecord } from '../../src/lib/Training/runJournal';

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

appTest('historyPanel: signed out, Delete offers device+Cancel; Cancel keeps, device removes', async ({ chat, history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  await chat.setSignedIn(false);
  await history.open();
  // Inline confirmation, and only the locations that hold the record:
  // signed out there is no cloud copy to offer.
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['device']);
  // Cancel is a real exit: both rows survive, on screen and in the store.
  await history.confirmDelete('Cancel');
  expect(await history.rowCount()).toBe(2);
  expect((await records.list('runs')).length).toBe(2);
  // Picking device removes the row AND the stored record.
  await history.requestDelete(0);
  await history.confirmDelete('device');
  expect(await history.rowCount()).toBe(1);
  expect(await history.rowText(0)).toContain('Fashion MNIST');
  const left = await records.list('runs');
  expect(left.length).toBe(1);
  expect(left[0]!.uuid).toBe('run-older');
});

appTest('historyPanel: signed in with no reachable backend degrades to the device-only prompt', async ({ chat, history, records, expect }) => {
  // The deleteChoices plumbing must swallow the API failure (progressive
  // enhancement) and fall back to the local copy — never throw, never block.
  await records.seed('runs', [newerRun()]);
  await chat.setSignedIn(true);
  await history.open();
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['device']);
  await history.confirmDelete('Cancel');
  expect(await history.rowCount()).toBe(1);
});

appTest('historyPanel: cloud-held records offer all three; cloud keeps the row, both removes it', async ({ backend, chat, history, records, expect }) => {
  await records.seed('runs', [olderRun(), newerRun()]);
  await backend.serve({ runs: [olderRun(), newerRun()] });
  await chat.setSignedIn(true);
  await history.open();
  // All three locations hold row 0 → all three buttons, in the offered order.
  const offered = await history.requestDelete(0);
  expect(offered).toEqual(['device', 'cloud', 'both']);
  // A cloud-only delete detaches the local copy but keeps it: the row STAYS,
  // the cloud copy is gone, and the survivor is flagged never-push-again.
  await history.confirmDelete('cloud');
  expect(await history.rowCount()).toBe(2);
  expect(await backend.uuids('runs')).toEqual(['run-older']);
  const survivor = (await records.list('runs')).find(r => r.uuid === 'run-newer') as RunRecord & { localOnly?: boolean } | undefined;
  expect(survivor?.localOnly).toBe(true);
  // 'both' on the still-cloud-held row removes every copy — the row disappears.
  const offeredOlder = await history.requestDelete(1);
  expect(offeredOlder).toEqual(['device', 'cloud', 'both']);
  await history.confirmDelete('both');
  expect(await history.rowCount()).toBe(1);
  expect(await history.rowText(0)).toContain('MNIST');
  expect(await backend.uuids('runs')).toEqual([]);
  expect((await records.list('runs')).map(r => r.uuid)).toEqual(['run-newer']);
});

appTest('historyPanel: empty journal shows the muted empty line', async ({ history, expect }) => {
  await history.open();
  expect(await history.rowCount()).toBe(0);
  expect(await history.emptyText()).toContain('No training runs recorded yet');
});
