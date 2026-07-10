// Wire tf.js fit() callbacks to the chart data objects. chartData0/chartData1
// are reactive (they live in TrainingZone's data), so reassigning labels/series
// here is what re-renders the charts — no imperative chart handle is needed.

// Debug trace of every chart update, kept in the historical "[Charts] ..."
// format: the training e2e counts these messages and parses their JSON to
// verify loss/accuracy progress (they used to be logged by Charts.vue before
// it became purely presentational).
const debugLogChartUpdate = (kind, chartData) => {
  if (!(typeof window !== 'undefined' && window.nnvp?.debug?.enableTraining)) return;
  console.log( // eslint-disable-line no-console
    `[Charts] ${kind} chart update:`,
    JSON.stringify({ labels: chartData.labels, series: chartData.series }),
  );
};

export default async (
  chartData0, chartData1, train, cancelRequestedAccessor, stopError,
) => {
  const batchLabels = [];
  const batchMetrics = { loss: [], acc: [] };
  const epochLabels = [];
  const epochMetrics = {
    loss: [], val_loss: [], acc: [], val_acc: [],
  };
  const callbacks = {
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
    },
  };
  return train(callbacks);
};
