/**
 * Pure Compare-tab logic (Phase F): the three-level identity verdict, the
 * differ-only config table, and the overlay chart shape. No Vue, no journal.
 */
import { logicTest } from '../harness/define';
import { compareVerdict, configDiffRows, overlayChartData } from '../../src/lib/Training/compareView';
import type { FoldedRun, TrainingConfigSnapshot } from '../../src/lib/Training/runEvents';
import type { ModelIdentity } from '../../src/lib/Training/modelIdentity';

const identity = (workHash: string, docHash: string): ModelIdentity => (
  { workHash, docHash, summary: 's' });

const config = (overrides: Partial<TrainingConfigSnapshot> = {}): TrainingConfigSnapshot => ({
  dataset: 'MNIST', optimizer: 'rmsprop', optimizerParams: { learningRate: 0.01 }, epochs: 5,
  loss: 'categoricalCrossentropy',
  ...overrides,
});

function fold(overrides: Partial<FoldedRun> & { uuid: string }): FoldedRun {
  return {
    startedAt: '2026-07-20T10:00:00.000Z', engineId: 'tfjs', config: config(),
    graphJson: '{}', hardware: null, parent: null, epochMetrics: [], outcome: 'completed',
    finishedAt: null, hidden: false, lastEventAt: null, eventCount: 1,
    ...overrides,
  };
}

logicTest('compareView: the verdict has three levels plus unknown', ({ expect }) => {
  expect(compareVerdict([identity('w', 'd'), identity('w', 'd')])).toBe('identical');
  expect(compareVerdict([identity('w', 'd1'), identity('w', 'd2')])).toBe('same-network');
  expect(compareVerdict([identity('w1', 'd1'), identity('w2', 'd2')])).toBe('different-network');
  expect(compareVerdict([identity('w', 'd'), null])).toBe('unknown');
});

logicTest('compareView: configDiffRows keeps only the rows where runs differ', ({ expect }) => {
  const rows = configDiffRows([
    config(),
    config({ optimizer: 'adam', epochs: 10 }),
  ]);
  const keys = rows.map(row => row.key);
  expect(keys).toContain('optimizer');
  expect(keys).toContain('epochs');
  expect(keys).not.toContain('dataset'); // identical → absent
  expect(keys).not.toContain('loss');
  expect(rows.find(row => row.key === 'optimizer')!.values).toEqual(['rmsprop', 'adam']);
});

logicTest('compareView: configDiffRows spells out optimizer params and missing configs', ({ expect }) => {
  const rows = configDiffRows([
    config(),
    config({ optimizerParams: { learningRate: 0.1 } }),
    null, // an orphan fold in the selection
  ]);
  const params = rows.find(row => row.key === 'optimizerParams')!;
  expect(params.values[0]).toContain('0.01');
  expect(params.values[1]).toContain('0.1');
  expect(params.values[2]).toBe('—');
});

logicTest('compareView: overlayChartData lines up runs on one epoch axis', ({ expect }) => {
  const runs = [
    fold({
      uuid: 'a',
      epochMetrics: [{ epoch: 0, valAcc: 0.5 }, { epoch: 1, valAcc: 0.7 }, { epoch: 2, valAcc: 0.8 }],
    }),
    fold({ uuid: 'b', epochMetrics: [{ epoch: 0, valAcc: 0.6 }] }),
  ];
  const chart = overlayChartData(runs, 'valAcc');
  expect(chart.labels).toEqual([0, 1, 2]);
  expect(chart.series.length).toBe(2);
  expect(chart.series[0]!.data).toEqual([0.5, 0.7, 0.8]);
  expect(chart.series[1]!.data).toEqual([0.6, undefined, undefined]);
  // Runs without the metric still get a (gap-only) line, never a crash.
  expect(overlayChartData([fold({ uuid: 'c' })], 'valAcc').series[0]!.data).toEqual([]);
});
