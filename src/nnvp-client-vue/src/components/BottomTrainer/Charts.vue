<template>
  <div id="Charts" class="Charts">
    <div id="ct-chart-container-batch" class="ct-chart-container">
      <div class="ct-chart-title">Batch Results</div>
      <div id="ct-chart-batch" class="ct-chart"></div>
    </div>
    <div id="ct-chart-container-epoch" class="ct-chart-container">
      <div class="ct-chart-title">Epoch Results</div>
      <div id="ct-chart-epoch" class="ct-chart"></div>
    </div>
  </div>
</template>

<script>
import * as Chartist from 'chartist';

import ChartistPluginTip from '@/lib/chartist-plugin-tip/chartist-plugin-tip';

require('@/../node_modules/chartist/dist/chartist.min.css');

export default {
  name: 'Charts',
  mounted() {
    this.$parent.chartData0 = {
      labels: [],
      series: [{ className: 'acc', name: 'acc', data: [] }, { className: 'loss', name: 'loss', data: [] }],
    };
    this.$parent.chartData1 = {
      labels: [],
      series: [
        { className: 'ct-series-acc', name: 'acc', data: [] },
        { className: 'ct-series-val-acc', name: 'val-acc', data: [] },
        { className: 'ct-series-loss', name: 'loss', data: [] },
        { className: 'ct-series-val-loss', name: 'val-loss', data: [] },
      ],
    };
    // eslint-disable-next-line
    const chartistPluginTip = new ChartistPluginTip(window, document, Chartist);
    this.$parent.batchChart = new Chartist.Line('#ct-chart-batch', this.chartData0, {
      lineSmooth: false, plugins: [Chartist.plugins.ctTip({ title: ':value' })],
    });
    this.$parent.epochChart = new Chartist.Line('#ct-chart-epoch', this.chartData1, {
      lineSmooth: false, plugins: [Chartist.plugins.ctTip({ title: ':value' })],
    });
  },
};
</script>

<style>
@font-face {
  font-family: "Roboto Regular";
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#Charts {
  height: 100%;
  display: grid;
  padding: 1%;
  grid-template-columns: 50% 50%;
}
.ct-chart-container {
  display: grid;
  grid-template-rows: 20px 1fr;
}
#ct-chart-container-batch {
  grid-column: 1/2;
}
#ct-chart-container-epoch {
  grid-column: 2/2;
}
.ct-chart-title {
  grid-rows: 1/2;
}
.ct-chart {
  grid-rows: 2/2;
  margin: 10px;
  height: 1fr;
  position: relative; /* Safari. */
}
.ct-point {
  stroke-width: 0; /* No points */
}
.ct-line {
  stroke-width: 3px;
}
.ct-chart > svg { /* Fix for Safari... */
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
.ct-series-acc .ct-bar, .ct-series-acc .ct-line, .ct-series-acc .ct-point,
.ct-series-acc .ct-slice-donut {
  stroke: rgba(255, 0, 0, 0.5);
}
.ct-series-val-acc .ct-bar, .ct-series-val-acc .ct-line, .ct-series-val-acc .ct-point,
.ct-series-val-acc .ct-slice-donut {
  stroke: rgba(255, 64, 0, 0.5);
}
.ct-series-loss .ct-bar, .ct-series-loss .ct-line, .ct-series-loss .ct-point,
.ct-series-loss .ct-slice-donut {
  stroke: rgba(0, 0, 255, 0.5);
}
.ct-series-val-loss .ct-bar, .ct-series-val-loss .ct-line, .ct-series-val-loss .ct-point,
.ct-series-val-loss .ct-slice-donut {
  stroke: rgba(0, 64, 255, 0.5);
}
</style>
