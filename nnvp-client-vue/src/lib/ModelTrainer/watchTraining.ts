// Wire tf.js fit() callbacks to the chart data objects. chartData0/chartData1
// are reactive (they live in TrainingZone's data), so reassigning labels/series
// here is what re-renders the charts — no imperative chart handle is needed.

import type { TrainingCallbacks } from '../Training/engine';

/** One chart line; `data` may carry gaps (metrics an engine cannot measure). */
interface ChartSeries {
  className: string;
  name: string;
  data: (number | undefined)[];
}

/** The reactive chart-data objects living in TrainingZone's data. */
interface ChartData {
  labels: number[];
  series: ChartSeries[];
}

type DebugWindow = Window & { nnvp?: { debug?: { enableTraining?: boolean } } };

// Debug trace of every chart update, kept in the historical "[Charts] ..."
// format: the training e2e counts these messages and parses their JSON to
// verify loss/accuracy progress (they used to be logged by Charts.vue before
// it became purely presentational).
const debugLogChartUpdate = (kind: string, chartData: ChartData): void => {
  if (!(typeof window !== 'undefined' && (window as DebugWindow).nnvp?.debug?.enableTraining)) return;
  console.log( // eslint-disable-line no-console
    `[Charts] ${kind} chart update:`,
    JSON.stringify({ labels: chartData.labels, series: chartData.series }),
  );
};

/**
 * The chart accumulation of one training RUN, which may span several fit
 * segments when the run is paused and resumed: pass the same WatchState to
 * each watchTraining call and the curves continue instead of resetting.
 */
export interface WatchState {
  batchLabels: number[];
  batchMetrics: { loss: number[]; acc: (number | undefined)[] };
  epochLabels: number[];
  epochMetrics: {
    loss: number[];
    val_loss: (number | undefined)[];
    acc: (number | undefined)[];
    val_acc: (number | undefined)[];
  };
}

export const createWatchState = (): WatchState => ({
  batchLabels: [],
  batchMetrics: { loss: [], acc: [] },
  epochLabels: [],
  epochMetrics: {
    loss: [], val_loss: [], acc: [], val_acc: [],
  },
});

export default async (
  chartData0: ChartData,
  chartData1: ChartData,
  train: (callbacks: TrainingCallbacks) => Promise<unknown>,
  cancelRequestedAccessor: () => boolean,
  stopError: unknown,
  // Run-journal hook, fired only for epochs that made it past the cancel
  // check — a cancel-interrupted epoch is dropped from charts and journal
  // alike. Structural type: this module stays decoupled from runJournal.
  onEpoch?: (m: { epoch: number; acc?: number; loss?: number; valAcc?: number; valLoss?: number }) => void,
  // Fresh by default (the historical one-fit-per-run behavior); a resumed
  // run passes its own state so curves accumulate across segments.
  state: WatchState = createWatchState(),
): Promise<unknown> => {
  const { batchLabels, batchMetrics, epochLabels, epochMetrics } = state;
  const callbacks: TrainingCallbacks = {
    onBatchEnd(batchNumber, s) {
      if (cancelRequestedAccessor()) throw stopError;
      batchLabels.push(batchNumber);
      batchMetrics.loss.push(s.loss);
      batchMetrics.acc.push(s.acc);
      chartData0.labels = [...Array(batchLabels.length).keys()]; // eslint-disable-line no-param-reassign
      chartData0.series = [ // eslint-disable-line no-param-reassign
        { className: 'ct-series-acc', name: 'acc', data: [...batchMetrics.acc] },
        { className: 'ct-series-loss', name: 'loss', data: [...batchMetrics.loss] },
      ];
      debugLogChartUpdate('Batch', chartData0);
    },
    onEpochEnd(epochNumber, s) {
      if (cancelRequestedAccessor()) throw stopError;
      epochLabels.push(epochNumber);
      epochMetrics.loss.push(s.loss);
      epochMetrics.acc.push(s.acc);
      epochMetrics.val_loss.push(s.val_loss);
      epochMetrics.val_acc.push(s.val_acc);
      chartData1.labels = [...Array(epochLabels.length).keys()]; // eslint-disable-line no-param-reassign
      chartData1.series = [ // eslint-disable-line no-param-reassign
        { className: 'ct-series-acc', name: 'acc', data: [...epochMetrics.acc] },
        { className: 'ct-series-val-acc', name: 'val_acc', data: [...epochMetrics.val_acc] },
        { className: 'ct-series-loss', name: 'loss', data: [...epochMetrics.loss] },
        { className: 'ct-series-val-loss', name: 'val_loss', data: [...epochMetrics.val_loss] },
      ];
      debugLogChartUpdate('Epoch', chartData1);
      onEpoch?.({
        epoch: epochNumber, acc: s.acc, loss: s.loss, valAcc: s.val_acc, valLoss: s.val_loss,
      });
    },
  };
  return train(callbacks);
};
