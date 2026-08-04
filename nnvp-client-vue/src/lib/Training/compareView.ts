/**
 * compareView.ts — pure logic for the Compare tab (Phase F): the identity
 * verdict over the selected runs, the differ-only config table, and the
 * overlaid epoch-curve chart shape. The panel is a thin binding over these.
 */

import type { FoldedRun, TrainingConfigSnapshot } from './runEvents';
import type { ModelIdentity } from './modelIdentity';

/**
 * The two-tier identity read out loud: same workHash + same docHash =
 * 'identical'; same workHash only = 'same-network' (naming/comments differ);
 * different workHash = 'different-network'. Any run without an identity
 * (orphan fold, unparseable snapshot) makes the verdict 'unknown' — never
 * guess.
 */
export type CompareVerdict = 'identical' | 'same-network' | 'different-network' | 'unknown';

export function compareVerdict(identities: (ModelIdentity | null)[]): CompareVerdict {
  if (identities.length === 0 || identities.some(identity => identity === null)) return 'unknown';
  if (new Set(identities.map(identity => identity!.workHash)).size > 1) return 'different-network';
  return new Set(identities.map(identity => identity!.docHash)).size > 1
    ? 'same-network' : 'identical';
}

export interface ConfigDiffRow {
  key: string;
  /** One display value per run, aligned with the input order; '—' = no config. */
  values: string[];
}

/** The snapshot keys the diff table walks, in display order. */
const CONFIG_KEYS: (keyof TrainingConfigSnapshot)[] = [
  'dataset', 'optimizer', 'optimizerParams', 'epochs', 'loss', 'phase2Dataset', 'phase2Epochs',
];

function configValue(config: TrainingConfigSnapshot | null, key: keyof TrainingConfigSnapshot): string {
  if (config === null) return '—';
  const value = config[key];
  if (value === undefined) return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Rows where at least two runs disagree — identical rows are noise, drop them. */
export function configDiffRows(configs: (TrainingConfigSnapshot | null)[]): ConfigDiffRow[] {
  return CONFIG_KEYS
    .map(key => ({ key, values: configs.map(config => configValue(config, key)) }))
    .filter(row => new Set(row.values).size > 1);
}

/** One chart line, in the exact shape LineChart consumes (gaps allowed). */
export interface ChartSeries {
  className: string;
  name: string;
  data: (number | undefined)[];
}

export interface ChartData {
  labels: number[];
  series: ChartSeries[];
}

export type CompareMetric = 'acc' | 'valAcc' | 'loss' | 'valLoss';

// Reuse the live chart's four series colors, cycling for larger selections.
const SERIES_CLASSES = ['ct-series-acc', 'ct-series-val-acc', 'ct-series-loss', 'ct-series-val-loss'];

/**
 * One metric across all selected runs on a shared absolute epoch axis. A run
 * missing epochs (or the whole metric) renders gaps — comparing an
 * unfinished run against a finished one is the normal case, not an error.
 */
export function overlayChartData(runs: FoldedRun[], metric: CompareMetric): ChartData {
  const maxEpoch = Math.max(-1, ...runs.flatMap(run => run.epochMetrics.map(m => m.epoch)));
  const labels = Array.from({ length: maxEpoch + 1 }, (_, epoch) => epoch);
  const series = runs.map((run, index): ChartSeries => {
    const data: (number | undefined)[] = Array.from(
      { length: run.epochMetrics.length ? maxEpoch + 1 : 0 },
      () => undefined,
    );
    run.epochMetrics.forEach((m) => {
      if (m.epoch >= 0 && m.epoch <= maxEpoch) data[m.epoch] = m[metric];
    });
    return {
      className: SERIES_CLASSES[index % SERIES_CLASSES.length]!,
      name: `#${index + 1} ${run.config?.dataset ?? run.uuid.slice(0, 8)}`,
      data,
    };
  });
  return { labels, series };
}
