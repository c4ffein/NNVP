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
          v-bind:value="selectedDataset"
          v-bind:loadableDatasets="loadableDatasets"
          v-bind:selectedOptimizer="selectedOptimizer"
          @changeSelectedOptimizer="changeSelectedOptimizer"
          v-bind:selectableOptimizers="selectableOptimizers"
          v-bind:epochs="epochs"
          @changeEpochs="changeEpochs"
          v-bind:loadDataset="loadDataset"
          v-bind:getWarningMessage="getWarningMessage"
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
import watchTraining from '../../lib/ModelTrainer/watchTraining';

import * as Chartist from 'chartist';
// import '@/../node_modules/chartist/dist/chartist.min.css'  TODO CHECK IF STILL NEEDED
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
      if (this.isTraining) { this.cancelRequested = true; return; }
      this.chartsClicked();
      this.isTraining = true;
      await this.startTraining();
      this.cancelRequested = false;
      this.isTraining = false;
    },
    changeSelectedOptimizer(value) { this.selectedOptimizer = value; },
    changeEpochs(value) { this.epochs = value; },
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
      const shape = this.datasets[datasetName].shape;
      async function train(model, data, fitCallbacks) {
        const BATCH_SIZE = 64;
        const trainDataSize = 500;
        const testDataSize = 100;
        const [trainXs, trainYs] = tf.tidy(() => {
          const d = data.nextTrainBatch(trainDataSize);
          return [d.xs.reshape([trainDataSize, ...shape]), d.labels];
        });
        const [testXs, testYs] = tf.tidy(() => {
          const d = data.nextTestBatch(testDataSize);
          return [d.xs.reshape([testDataSize, ...shape]), d.labels];
        });
        return model.fit(trainXs, trainYs, {
          batchSize: BATCH_SIZE,
          validationData: [testXs, testYs],
          epochs: epochs,
          shuffle: true,
          callbacks: fitCallbacks,
        });
      }
      try {
        await watchTraining(
          this.batchChart, this.epochChart, this.chartData0, this.chartData1,
          (callbacks) => train(model, data, callbacks), () => this.cancelRequested,
          'cancelRequested',
        );
      }
      catch (error) {
        if (error == "cancelRequested") return;
        alert(error);
      }
    },
    async loadDataset(name, progressionCallback) {
      // TODO : change behaviour when already loading
      this.datasets = this.datasets || {};
      if (!(name in this.datasets)){
        const newDataset = new Dataset(
          this.loadableDatasets[name][0].imagesSpritePath,
          this.loadableDatasets[name][0].imagesSpriteChecksum,
          this.loadableDatasets[name][0].shape,
          this.loadableDatasets[name][0].labelsPath,
          this.loadableDatasets[name][0].labelsChecksum,
          10,  // number of classes
          this.loadableDatasets[name][0].numDatasetElements,
          this.loadableDatasets[name][0].numTrainElements,
        );
        await newDataset.load(progressionCallback);
        this.datasets[name] = newDataset;
      }
    },
    getWarningMessage(name, progressionCallback) {
      if (this.loadableDatasets[name].length >= 3 && !this.datasets[name]) {
        return this.loadableDatasets[name][2];
      }
    },
  },
  props: {
    bottomTrainerSize: Number,
    cdnDir: {
      type: String,
      default: "https://datasets.nnvp.io/datasets/",
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
