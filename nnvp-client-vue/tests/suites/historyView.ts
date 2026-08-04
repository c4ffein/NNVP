/**
 * Pure History-tab view logic (Phase F): filter predicates over folds and
 * grouping by workHash. No Vue, no journal — the panel calls these with
 * whatever it listed; both worlds render the same decisions.
 */
import { logicTest } from '../harness/define';
import { EMPTY_RUN_FILTERS, groupRuns, runMatchesFilters } from '../../src/lib/Training/historyView';
import type { FoldedRun } from '../../src/lib/Training/runEvents';
import type { ModelIdentity } from '../../src/lib/Training/modelIdentity';

function fold(overrides: Partial<FoldedRun> & { uuid: string }): FoldedRun {
  return {
    startedAt: '2026-07-20T10:00:00.000Z',
    engineId: 'tfjs',
    config: {
      dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: {}, epochs: 5,
      loss: 'categoricalCrossentropy',
    },
    graphJson: '{"layers":[]}',
    hardware: null,
    parent: null,
    epochMetrics: [],
    outcome: 'completed',
    finishedAt: '2026-07-20T10:01:00.000Z',
    hidden: false,
    lastEventAt: '2026-07-20T10:01:00.000Z',
    eventCount: 2,
    ...overrides,
  };
}

const identity = (workHash: string, docHash: string, summary: string): ModelIdentity => (
  { workHash, docHash, summary });

logicTest('historyView: the empty filter set keeps every visible run and drops hidden ones', ({ expect }) => {
  expect(runMatchesFilters(fold({ uuid: 'a' }), EMPTY_RUN_FILTERS)).toBe(true);
  expect(runMatchesFilters(fold({ uuid: 'b', hidden: true }), EMPTY_RUN_FILTERS)).toBe(false);
  expect(runMatchesFilters(fold({ uuid: 'c', hidden: true }), { ...EMPTY_RUN_FILTERS, showHidden: true })).toBe(true);
});

logicTest('historyView: dataset and outcome filters, including the synthetic "unfinished"', ({ expect }) => {
  const mnist = fold({ uuid: 'a' });
  const unfinished = fold({ uuid: 'b', outcome: null, finishedAt: null });
  expect(runMatchesFilters(mnist, { ...EMPTY_RUN_FILTERS, dataset: 'MNIST' })).toBe(true);
  expect(runMatchesFilters(mnist, { ...EMPTY_RUN_FILTERS, dataset: 'CIFAR-10' })).toBe(false);
  expect(runMatchesFilters(mnist, { ...EMPTY_RUN_FILTERS, outcome: 'completed' })).toBe(true);
  expect(runMatchesFilters(mnist, { ...EMPTY_RUN_FILTERS, outcome: 'unfinished' })).toBe(false);
  expect(runMatchesFilters(unfinished, { ...EMPTY_RUN_FILTERS, outcome: 'unfinished' })).toBe(true);
  // A run with no config at all (orphan fold) fails any dataset filter.
  expect(runMatchesFilters(fold({ uuid: 'c', config: null }), { ...EMPTY_RUN_FILTERS, dataset: 'MNIST' })).toBe(false);
});

logicTest('historyView: ran-on and lib filters go through the engine table', ({ expect }) => {
  const worker = fold({ uuid: 'a', engineId: 'tfjs-worker' });
  const bench = fold({ uuid: 'b', engineId: 'tinygrad' });
  expect(runMatchesFilters(worker, { ...EMPTY_RUN_FILTERS, ranOn: 'browser' })).toBe(true);
  expect(runMatchesFilters(worker, { ...EMPTY_RUN_FILTERS, ranOn: 'remote' })).toBe(false);
  expect(runMatchesFilters(worker, { ...EMPTY_RUN_FILTERS, lib: 'tfjs' })).toBe(true);
  expect(runMatchesFilters(bench, { ...EMPTY_RUN_FILTERS, lib: 'tinyloop' })).toBe(true);
  // Unknown engines match no ran-on/lib filter (but pass when unfiltered).
  const alien = fold({ uuid: 'c', engineId: 'martian' });
  expect(runMatchesFilters(alien, EMPTY_RUN_FILTERS)).toBe(true);
  expect(runMatchesFilters(alien, { ...EMPTY_RUN_FILTERS, ranOn: 'browser' })).toBe(false);
});

logicTest('historyView: groupRuns buckets by workHash in encounter order, unknowns together', ({ expect }) => {
  const runs = [
    fold({ uuid: 'a1' }), fold({ uuid: 'b1' }), fold({ uuid: 'a2' }),
    fold({ uuid: 'orphan', graphJson: null }),
  ];
  const groups = groupRuns(runs, {
    a1: identity('work-A', 'doc-1', 'Input → Dense'),
    a2: identity('work-A', 'doc-2', 'Input → Dense'),
    b1: identity('work-B', 'doc-3', 'Input → Dense×2'),
    orphan: null,
  });
  expect(groups.map(g => g.workHash)).toEqual(['work-A', 'work-B', null]);
  expect(groups[0]!.runs.map(r => r.uuid)).toEqual(['a1', 'a2']);
  expect(groups[0]!.summary).toBe('Input → Dense');
  expect(groups[0]!.docVariantCount).toBe(2); // two naming variants of one network
  expect(groups[1]!.docVariantCount).toBe(1);
  expect(groups[2]!.summary).toBeNull();
});

logicTest('historyView: groupRuns surfaces the best val-acc across a group', ({ expect }) => {
  const runs = [
    fold({ uuid: 'a1', epochMetrics: [{ epoch: 0, valAcc: 0.71 }, { epoch: 1, valAcc: 0.84 }] }),
    fold({ uuid: 'a2', epochMetrics: [{ epoch: 0, valAcc: 0.9 }] }),
    fold({ uuid: 'a3' }), // no metrics — must not produce NaN
  ];
  const shared = {
    a1: identity('w', 'd', 's'), a2: identity('w', 'd', 's'), a3: identity('w', 'd', 's'),
  };
  expect(groupRuns(runs, shared)[0]!.bestValAcc).toBe(0.9);
  expect(groupRuns([fold({ uuid: 'a3' })], { a3: identity('w', 'd', 's') })[0]!.bestValAcc).toBeNull();
});
