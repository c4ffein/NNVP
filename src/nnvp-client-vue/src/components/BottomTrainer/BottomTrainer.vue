<template>
  <div id="BottomTrainer" class="BottomTrainer">
    <div id="trainer-bar" class="BottomTrainer">
      <div class="BottomTrainer bar-button" v-on:click="datasetClicked">
        Dataset
      </div>
      <div class="BottomTrainer bar-button" v-on:click="compileOptionsClicked">
        Options
      </div>
      <div class="BottomTrainer bar-button" v-on:click="chartsClicked">
        Charts
      </div>
      <div class="BottomTrainer bar-button" v-on:click="trainClicked">
        {{isTraining ? 'Stop' : 'Train'}}
      </div>
      <div id="button-close-trainer" v-on:click="$emit('close-trainer')">╳</div>
    </div>
    <div id="bottom-trainer-selector">
      <keep-alive>
        <component
          v-bind:is="selectedPanel"
          v-bind:ref="'child'+selectedPanel"
          class="tab"
          v-model="selectedDataset"
          v-bind:loadableDatasets="loadableDatasets"
          v-bind:selectedOptimizer="selectedOptimizer"
          @changeSelectedOptimizer="changeSelectedOptimizer"
          v-bind:selectableOptimizers="selectableOptimizers"
          v-bind:epochs="epochs"
          @changeEpochs="changeEpochs"
        ></component>
      </keep-alive>
    </div>
  </div>
</template>

<script>
/* eslint-disable */
import * as tf from '@tensorflow/tfjs';
import Dataset from '../../lib/JSDatasets/google-data-loader';
import loadableDatasets from '../../lib/JSDatasets/datasets-sources';

import * as Chartist from 'chartist';
require('@/../node_modules/chartist/dist/chartist.min.css')
import ChartistPluginTip from '@/lib/chartist-plugin-tip/chartist-plugin-tip';

import Charts from './Charts.vue';
import CompileOptions from './CompileOptions.vue';
import DatasetSelector from './DatasetSelector.vue';

export default {
  name: 'BottomTrainer',
  components: {
    Charts,
    CompileOptions,
    DatasetSelector,
  },
  data() {
    return {
      isTraining: false,
      cancelRequested: false,
      selectedDataset: 'MNIST',
      loadableDatasets: loadableDatasets(this.cdnDir),
      selectedOptimizer: 'rmsprop',
      epochs: 10,
      selectableOptimizers: [
        'sgd', 'adagrad', 'adadelta', 'adam', 'adamax', 'rmsprop'
      ],
      selectedPanel: "DatasetSelector",
    };
  },
  methods: {
    datasetClicked() {
      if (this.selectedPanel == "DatasetSelector") return;
      this.selectedPanel = "DatasetSelector";
      this.$nextTick(() => {this.$refs.childDatasetSelector.refresh();});
    },
    compileOptionsClicked() {
      this.selectedPanel = "CompileOptions";
    },
    chartsClicked() {
      this.selectedPanel = "Charts";
      this.$nextTick(() => {this.batchChart.update();this.epochChart.update();});
    },
    async trainClicked() {
      if (this.isTraining) {
        this.cancelRequested = true;
        return
      }
      this.chartsClicked();
      this.isTraining = true;
      await this.startTraining();
      this.cancelRequested = false;
      this.isTraining = false;
    },
    changeSelectedOptimizer(value) {
      this.selectedOptimizer = value;
    },
    changeEpochs(value) {
      this.epochs = value;
    },
    async startTraining() {
      window.tf = tf;
      const optimizer = this.selectedOptimizer;
      const epochs = this.epochs;
      let createModel;
      try {
        createModel = eval(
          `tf=window.tf;\n${this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface)}createModel`
        );
      }
      catch (error) {
        alert("Incorrect network : couldn't find Inputs/Outputs, or they weren't connected.");
        console.log(error);
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
        return;
      }
      model.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      const datasetName = this.selectedDataset;
      await this.loadDataset(datasetName);
      const data = this.datasets[datasetName];
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
          epochs: epochs,
          shuffle: true,
          callbacks: fitCallbacks,
        });
      }
      const chartData0 = this.chartData0;
      const chartData1 = this.chartData1;
      const watchTraining = async (batchChart, epochChart, cancelRequestedContainer) => {
        const batchLabels = [];
        const batchMetrics = { loss: [], acc: [] };
        const epochLabels = [];
        const epochMetrics = { loss: [], val_loss: [], acc: [], val_acc: [] };
        const callbacks = {
          onBatchEnd(batchNumber, s) {
            if (cancelRequestedAccessor()) throw "cancelRequested";
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
          },
          onEpochEnd(epochNumber, s) {
            if (cancelRequestedAccessor()) throw "cancelRequested";
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
      const cancelRequestedAccessor = () => this.cancelRequested;
      try {
        await watchTraining(this.batchChart, this.epochChart, cancelRequestedAccessor);
      }
      catch (error) {
        if (error == "cancelRequested") return;
        alert(error);
      }
    },
    async loadDataset(name) {
      // TODO : change behaviour when already loading
      this.datasets = this.datasets || {};
      if (!(name in this.datasets)){
        const newDataset = new Dataset(
          this.loadableDatasets[name][0].imagesSpritePath,
          this.loadableDatasets[name][0].imagesSpriteChecksum,
          this.loadableDatasets[name][0].labelsPath,
          this.loadableDatasets[name][0].labelsChecksum,
          this.loadableDatasets[name][0].imageSize,
        );
        await newDataset.load();
        this.datasets[name] = newDataset;
      }
    },
  },
  props: {
    bottomTrainerSize: Number,
    cdnDir: {
      type: String,
      default: "https://nnvpdemo.tech/datasets/",
    },
  },
  watch: {
    bottomTrainerSize (newVal, oldVal) {
      window.dispatchEvent(new Event('resize')); // Needed for svg resize
    }
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
  width: 100%;
  cursor: default;
  font-family: "Roboto Thin";
  font-size: 15px;
  border-top: 1px solid rgba(100, 100, 100, 0.3);
  display: grid;
  grid-template-rows: 24px 1fr;
}
#trainer-bar {
  display: table;
  table-layout: fixed;
  grid-rows: 1/2;
  border-bottom: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0.2);
  width: 100%;
}
#trainer-bar > * {
  background-color: rgba(100, 100, 100, 0);
}
#trainer-bar > *:hover {
  background-color: rgba(100, 100, 100, 0.1);
}
.BottomTrainer.bar-button{
  display: table-cell;
  height: 100%;
  border-radius: 0;
  border: none;
  border-right: 1px solid rgba(100, 100, 100, 0.3);
  line-height: 24px; /* Vertical align text*/
}
#button-close-trainer{
  display: table-cell;
  border: none;
  width: 30px;
}
#bottom-trainer-selector {
  grid-rows: 2/2;
}
.BottomTrainer select, .BottomTrainer input {
  border: 1px solid rgba(100, 100, 100, 0.3);
  height: 26px;
  width: auto;
  border-radius: 0;
  background-color: rgba(100, 100, 100, 0);
  box-sizing: border-box; /* Needed so that input and select sizes are equals */
}
</style>
