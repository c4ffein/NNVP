<template>
  <div id="BottomTrainer" class="BottomTrainer">
    <div id="trainer-bar" class="BottomTrainer">
      <select class="BottomTrainer bar-button" v-model="selectedDataset">
        <option v-bind:key="key" v-for="(item, key) in loadedDatasets" v-bind:value="key">
          {{key}}
        </option>
      </select>
      <button class="BottomTrainer bar-button" v-on:click="startTraining">
        {{isTraining ? 'Stop' : 'Train'}}
      </button>
      <div class="BottomTrainer bar-button" id="experimental-warning">
        Warning : experimental
      </div>
      <button id="button-close-trainer" v-on:click="$emit('close-trainer')">╳</button>
    </div>
    <div id="trainer-canvas-container">
      <div id="ct-chart-container-batch" class="ct-chart-container">
        <div class="ct-chart-title">Batch Results</div>
        <div id="ct-chart-batch" class="ct-chart"></div>
      </div>
      <div id="ct-chart-container-epoch" class="ct-chart-container">
        <div class="ct-chart-title">Epoch Results</div>
        <div id="ct-chart-epoch" class="ct-chart"></div>
      </div>
    </div>
  </div>
</template>

<script>
/* eslint-disable */
import * as tf from '@tensorflow/tfjs';
import Dataset from '../lib/JSDatasets/google-data-loader';

import * as Chartist from 'chartist';
require('@/../node_modules/chartist/dist/chartist.min.css')
import ChartistPluginTip from '@/lib/chartist-plugin-tip/chartist-plugin-tip';

export default {
  name: 'BottomTrainer',
  data() {
    return {
      isTraining: false,
      selectedDataset: 'MNIST Data',
      loadedDatasets: {
        'MNIST Data': '', // MnistData, empty for now...
      },
      epochChart: null,
      batchChart: null,
    };
  },
  methods: {
    async startTraining() {
      if (this.isTraining) return;
      this.isTraining = !this.isTraining;
      window.tf = tf;
      let createModel;
      try {
        createModel = eval(
          `tf=window.tf;\n${this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface)}createModel`,
        );
      }
      catch (error) {
        alert("Incorrect network : couldn't find Inputs/Outputs, or they weren't connected.");
        console.log(error);
        this.isTraining = !this.isTraining;
        return;
      }
      let model;
      try {
        model = createModel();
      }
      catch (error) {
        // Param errors
        alert(error);
        console.log(error);
        this.isTraining = !this.isTraining;
        return;
      }
      const optimizer = 'rmsprop'; // TODO : allow to set
      model.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      // const data = new this.loadedDatasets[this.selectedDataset]();
      const data = new Dataset();
      await data.load();
      async function train(model, data, fitCallbacks) {
        const BATCH_SIZE = 64;
        const trainDataSize = 500;
        const testDataSize = 100;
        const [trainXs, trainYs] = tf.tidy(() => {
          const d = data.nextTrainBatch(trainDataSize);
          return [d.xs.reshape([trainDataSize, 28, 28, 1]), d.labels];
        });
        const [testXs, testYs] = tf.tidy(() => {
          const d = data.nextTestBatch(testDataSize);
          return [d.xs.reshape([testDataSize, 28, 28, 1]), d.labels];
        });
        return model.fit(trainXs, trainYs, {
          batchSize: BATCH_SIZE,
          validationData: [testXs, testYs],
          epochs: 10,
          shuffle: true,
          callbacks: fitCallbacks,
        });
      }
      function resetChart(chart) {
        return;
      }
      const chartData0 = this.chartData0;
      const chartData1 = this.chartData1;
      async function watchTraining(batchChart, epochChart) {
        const batchLabels = [];
        const batchMetrics = { loss: [], acc: [] };
        const epochLabels = [];
        const epochMetrics = { loss: [], val_loss: [], acc: [], val_acc: [] };
        const callbacks = {
          onBatchEnd(batchNumber, s) {
            batchLabels.push(batchNumber);
            batchMetrics.loss.push(s.loss);
            batchMetrics.acc.push(s.acc);
            const indexArr = [...Array(batchLabels.length).keys()];
            const moduloVal = (x => x > 25 ? Math.ceil(x / 25) : 1)(indexArr.length);
            chartData0.labels = indexArr;
            chartData0.series = [
              {className: "ct-series-acc", name: "acc", data:batchMetrics.acc},
              {className: "ct-series-loss", name: "loss", data:batchMetrics.loss},
            ];
            const addedOptions = {
              axisX: { labelInterpolationFnc (value, index) {
                return index % moduloVal  === 0 ? value : null;
              },
              ctTipData: chartData0,
            }};
            batchChart.update(chartData0, addedOptions, true);
            console.log(batchChart);
          },
          onEpochEnd(epochNumber, s) {
            epochLabels.push(epochNumber);
            epochMetrics.loss.push(s.loss);
            epochMetrics.acc.push(s.acc);
            epochMetrics.val_loss.push(s.val_loss);
            epochMetrics.val_acc.push(s.val_acc);
            const indexArr = [...Array(epochLabels.length).keys()];
            const moduloVal = (x => x > 25 ? Math.ceil(x / 25) : 1)(indexArr.length);
            chartData1.labels = indexArr;
            chartData1.series = [
              {className: "ct-series-acc", name: "acc", data:epochMetrics.acc},
              {className: "ct-series-val-acc", name: "val_acc", data:epochMetrics.val_acc},
              {className: "ct-series-loss", name: "loss", data:epochMetrics.loss},
              {className: "ct-series-val-loss", name: "val_loss", data:epochMetrics.val_loss},
            ];
            const addedOptions = {
              axisX: { labelInterpolationFnc (value, index) {
                return index % moduloVal  === 0 ? value : null;
              },
              ctTipData: chartData1,
            }};
            epochChart.update(chartData1, addedOptions, true);
          }
        }
        return train(model, data, callbacks);
      }
      resetChart(this.batchChart);
      resetChart(this.epochChart);
      try {
        await watchTraining(this.batchChart, this.epochChart);
      }
      catch (error) {
        alert(error);
      }
      this.isTraining = !this.isTraining;
    },
    switch() {
      this.isTraining = !this.isTraining;
    },
  },
  mounted() {
    this.chartData0 = {
      labels: [],
      series: [{className: "acc", name: "acc", data:[]}, {className: "loss", name: "loss", data:[]}],
    };
    this.chartData1 = {
      labels: [],
      series: [
        {className: "ct-series-acc", name: "acc", data:[]},
        {className: "ct-series-val-acc", name: "val-acc", data:[]},
        {className: "ct-series-loss", name: "loss", data:[]},
        {className: "ct-series-val-loss", name: "val-loss", data:[]}
      ],
    };
    const chartistPluginTip = new ChartistPluginTip(window, document, Chartist);
    this.batchChart = new Chartist.Line('#ct-chart-batch', this.chartData0, {
      lineSmooth : false, plugins: [Chartist.plugins.ctTip({title: ':value'})]
    });
    this.epochChart = new Chartist.Line('#ct-chart-epoch', this.chartData1, {
      lineSmooth : false, plugins: [Chartist.plugins.ctTip({title: ':value'})]
    });
  },
  props: ['bottomTrainerSize'],
  watch: {
    bottomTrainerSize (newVal, oldVal) {
      window.dispatchEvent(new Event('resize')); // Needed for svg resize
    }
  }
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
#BottomTrainer {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: "Roboto Thin";
  font-size: 15px;
  overflow: hidden;
  border-top: 1px solid rgba(100, 100, 100, 0.3);
  display: grid;
  grid-template-rows: 26px 1fr;
}
#trainer-bar {
  grid-rows: 1/2;
  min-height: 26px;
  overflow: hidden;
  border-bottom: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0.2);
}
#trainer-bar > * {
  background-color: rgba(100, 100, 100, 0);
}
#trainer-bar > *:hover {
  background-color: rgba(100, 100, 100, 0.1);
}
.BottomTrainer.bar-button{
  float: left;
  height: 26px;
  width: 166px;
  border-radius: 0;
  border: none;
  border-right: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0);
  padding-left: 10px;
}
#experimental-warning {
  border: none;
  padding-left: 30px;
}
#experimental-warning:hover {
  background-color: rgba(100, 100, 100, 0.0);
}
#button-close-trainer{
  float: right;
  border: none;
  line-height: 26px;
  transform: translate(0, -12%);
}
#trainer-canvas-container {
  grid-rows: 2/2;
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
.ct-series-acc .ct-bar, .ct-series-acc .ct-line, .ct-series-acc .ct-point, .ct-series-acc .ct-slice-donut {
  stroke: rgba(255, 0, 0, 0.5);
}
.ct-series-val-acc .ct-bar, .ct-series-val-acc .ct-line, .ct-series-val-acc .ct-point, .ct-series-val-acc .ct-slice-donut {
  stroke: rgba(255, 64, 0, 0.5);
}
.ct-series-loss .ct-bar, .ct-series-loss .ct-line, .ct-series-loss .ct-point, .ct-series-loss .ct-slice-donut {
  stroke: rgba(0, 0, 255, 0.5);
}
.ct-series-val-loss .ct-bar, .ct-series-val-loss .ct-line, .ct-series-val-loss .ct-point, .ct-series-val-loss .ct-slice-donut {
  stroke: rgba(0, 64, 255, 0.5);
}
</style>
