export default async (
  batchChart, epochChart, chartData0, chartData1, train, cancelRequestedAccessor, stopError,
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
      const indexArr = [...Array(batchLabels.length).keys()];
      const moduloVal = (x => (x > 25 ? Math.ceil(x / 25) : 1))(indexArr.length);
      chartData0.labels = indexArr; // eslint-disable-line no-param-reassign
      chartData0.series = [ // eslint-disable-line no-param-reassign
        { className: 'ct-series-acc', name: 'acc', data: batchMetrics.acc },
        { className: 'ct-series-loss', name: 'loss', data: batchMetrics.loss },
      ];
      const addedOptions = {
        axisX: {
          labelInterpolationFnc(value, index) {
            return index % moduloVal === 0 ? value : null;
          },
          ctTipData: chartData0,
        },
      };
      batchChart.update(chartData0, addedOptions, true);
    },
    onEpochEnd(epochNumber, s) {
      if (cancelRequestedAccessor()) throw stopError;
      epochLabels.push(epochNumber);
      epochMetrics.loss.push(s.loss);
      epochMetrics.acc.push(s.acc);
      epochMetrics.val_loss.push(s.val_loss);
      epochMetrics.val_acc.push(s.val_acc);
      const indexArr = [...Array(epochLabels.length).keys()];
      const moduloVal = (x => (x > 25 ? Math.ceil(x / 25) : 1))(indexArr.length);
      chartData1.labels = indexArr; // eslint-disable-line no-param-reassign
      chartData1.series = [ // eslint-disable-line no-param-reassign
        { className: 'ct-series-acc', name: 'acc', data: epochMetrics.acc },
        { className: 'ct-series-val-acc', name: 'val_acc', data: epochMetrics.val_acc },
        { className: 'ct-series-loss', name: 'loss', data: epochMetrics.loss },
        { className: 'ct-series-val-loss', name: 'val_loss', data: epochMetrics.val_loss },
      ];
      const addedOptions = {
        axisX: {
          labelInterpolationFnc(value, index) {
            return index % moduloVal === 0 ? value : null;
          },
          ctTipData: chartData1,
        },
      };
      epochChart.update(chartData1, addedOptions, true);
    },
  };
  return train(callbacks);
};
