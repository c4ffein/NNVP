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
      <div id="trainer-canvas-container-1">
        <canvas id="myChart1"></canvas>
      </div>
      <div id="trainer-canvas-container-2">
        <canvas id="myChart2"></canvas>
      </div>
    </div>
  </div>
</template>

<script>
/* eslint-disable */
import * as tf from '@tensorflow/tfjs';
import { IMAGE_H, IMAGE_W, MnistData } from '../lib/JSDatasets/google-mnist-data';

import Chart from 'chart.js';

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
      this.isTraining = !this.isTraining;
      if (!this.isTraining) return;
      window.tf = tf;
      const createModel = eval(
        `tf=window.tf;\n${this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface)}createModel`,
      );
      const model = createModel();
      const optimizer = 'rmsprop'; // TODO : allow to set
      model.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      // const data = new this.loadedDatasets[this.selectedDataset]();
      const data = new MnistData();
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
        chart.data.labels = [];
        chart.data.datasets.map(dataset => dataset.data = []);
        chart.update();
      }
      async function watchTraining(batchChart, epochChart) {
        const batchMetrics = { loss: [], acc: [] };
        const epochMetrics = { loss: [], val_loss: [], acc: [], val_acc: [] };
        const callbacks = {
          onBatchEnd(batchNumber, s) {
            /*batchMetrics.loss.push(s.loss);
            batchMetrics.acc.push(s.acc);*/
            batchChart.data.labels.push(batchChart.data.labels.length);
            batchChart.data.datasets[0].data.push(s.loss);
            batchChart.data.datasets[1].data.push(s.acc);
            batchChart.update();
          },
          onEpochEnd(epochNumber, s) {
            /*epochMetrics.loss.push(s.loss);
            epochMetrics.acc.push(s.acc);
            epochMetrics.val_loss.push(s.loss);
            epochMetrics.val_acc.push(s.acc);*/
            epochChart.data.labels.push(epochChart.data.labels.length);
            epochChart.data.datasets[0].data.push(s.loss);
            epochChart.data.datasets[1].data.push(s.val_loss);
            epochChart.data.datasets[2].data.push(s.acc);
            epochChart.data.datasets[3].data.push(s.val_acc);
            epochChart.update();
          }
        }
        return train(model, data, callbacks);
      }
      resetChart(this.batchChart);
      resetChart(this.epochChart);
      await watchTraining(this.batchChart, this.epochChart);
    },
    switch() {
      this.isTraining = !this.isTraining;
    },
    createChart(canvasID, chartName, initialDatasets) {
      var ctx = document.getElementById(canvasID).getContext('2d');
      var myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: initialDatasets,
        },
        options: {
          responsive: true,
          title: { display: true, text: chartName },
          tooltips: { mode: 'index', intersect: false },
          elements: { point: { radius: 0 }, line: { tension: 0 } },
          hover: { mode: 'nearest', intersect: true },
          scales: {
            xAxes: [{
              display: true, /*scaleLabel: { display: true, labelString: xLabel }*/
            }],
            yAxes: [{
              display: true, /*scaleLabel: { display: true, labelString: yLabel }*/
            }]
          }
        }
      });
      return myChart;
    }
  },
  mounted() {
    this.batchChart = this.createChart('myChart1', 'Batch', [
      {label: 'loss', data: [], backgroundColor: 'rgba(0, 0, 255, 0.5)', color: 'rgba(0, 0, 255, 1)', borderColor: 'rgba(0, 0, 255, 0.5)', fill: false},
      {label: 'acc', data: [], backgroundColor: 'rgba(255, 0, 0, 0.5)', color: 'rgba(255, 0, 0, 1)', borderColor: 'rgba(255, 0, 0, 0.5)', fill: false},
    ]);
    this.epochChart = this.createChart('myChart2', 'Epoch', [
      {label: 'loss', data: [], backgroundColor: 'rgba(0, 0, 255, 0.5)', color: 'rgba(0, 0, 255, 1)', borderColor: 'rgba(0, 0, 255, 0.5)', fill: false},
      {label: 'val_loss', data: [], backgroundColor: 'rgba(0, 64, 255, 0.5)', color: 'rgba(0, 64, 255, 1)', borderColor: 'rgba(0, 64, 255, 0.5)', fill: false},
      {label: 'acc', data: [], backgroundColor: 'rgba(255, 0, 0, 0.5)', color: 'rgba(255, 0, 0, 1)', borderColor: 'rgba(255, 0, 0, 0.5)', fill: false},
      {label: 'val_acc', data: [], backgroundColor: 'rgba(255, 64, 0, 0.5)', color: 'rgba(255, 64, 0, 1)', borderColor: 'rgba(255, 64, 0, 0.5)', fill: false},
    ]);
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
#BottomTrainer {
  height: 100%;
  cursor: default;
  font-family: "Roboto Thin";
  font-size: 15px;
  overflow: hidden;
  border-top: 1px solid rgba(100, 100, 100, 0.3);
  display: flex;
  flex-flow: column;
  width: 100%;
}
#trainer-bar {
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
  flex: 1;
  padding: 20px;
}
#trainer-canvas-container-1{
  width: 40%;
  height: 800%;
  float: left;
}
#trainer-canvas-container-2{
  width: 40%;
  height: 80%;
  float: right;
}
</style>
