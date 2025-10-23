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
          @input="value => { if (typeof value === 'string') selectedDataset = value; }"
          v-bind:loadableDatasets="loadableDatasets"
          v-bind:selectedOptimizer="selectedOptimizer"
          @changeSelectedOptimizer="changeSelectedOptimizer"
          v-bind:selectableOptimizers="selectableOptimizers"
          v-bind:epochs="epochs"
          @changeEpochs="changeEpochs"
          v-bind:loadDataset="loadDataset"
          v-bind:getDatasets="getDatasets"
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
      // Initialize chart data here so it's always available
      chartData0: null,
      chartData1: null,
    };
  },
  mounted() {
    // Initialize chart data (Charts component will use these)
    this.chartData0 = {
      labels: [],
      series: [{ className: 'acc', name: 'acc', data: [] }, { className: 'loss', name: 'loss', data: [] }],
    };
    this.chartData1 = {
      labels: [],
      series: [
        { className: 'ct-series-acc', name: 'acc', data: [] },
        { className: 'ct-series-val-acc', name: 'val-acc', data: [] },
        { className: 'ct-series-loss', name: 'loss', data: [] },
        { className: 'ct-series-val-loss', name: 'val-loss', data: [] },
      ],
    };
    console.log('[BottomTrainer] Chart data initialized');
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
      // Wait for Charts component to mount
      await this.$nextTick();
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
        // Create a function scope to avoid const reassignment error
        createModel = eval(
          `(function() { const tf = window.tf; ${this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface)} return createModel; })()`
        );
      }
      catch (error) {
        alert("Incorrect network : couldn't find Inputs/Outputs, or they weren't connected.");
        console.error('[BottomTrainer] Error generating model:', error);
        return;
      }
      let model;
      try {
        model = createModel();
      }
      catch (error) {
        // Param errors
        alert(error);
        console.error('[BottomTrainer] Error creating model:', error);
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
        console.error('[BottomTrainer] Training error:', error);
        alert(error);
      }
    },
    async loadDataset(name, progressionCallback) {
      if (window.nnvpDebugDatasets) console.log(`[BottomTrainer] loadDataset called for: ${name}`);

      // TODO : change behaviour when already loading
      this.datasets = this.datasets || {};
      if (!(name in this.datasets)){
        if (window.nnvpDebugDatasets) {
          console.log(`[BottomTrainer] Dataset ${name} not cached, loading from:`);
          console.log(`  - Images: ${this.loadableDatasets[name][0].imagesSpritePath}`);
          console.log(`  - Labels: ${this.loadableDatasets[name][0].labelsPath}`);
        }

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

        if (window.nnvpDebugDatasets) console.log(`[BottomTrainer] Starting newDataset.load() for: ${name}`);

        try {
          await newDataset.load(progressionCallback);
          this.datasets[name] = newDataset;
          if (window.nnvpDebugDatasets) console.log(`[BottomTrainer] Dataset ${name} loaded and cached successfully`);
        } catch (error) {
          if (window.nnvpDebugDatasets) console.error(`[BottomTrainer] Error loading dataset ${name}:`, error);
          throw error;
        }
      } else {
        if (window.nnvpDebugDatasets) console.log(`[BottomTrainer] Dataset ${name} already cached`);
      }
    },
    getWarningMessage(name, progressionCallback) {
      if (this.loadableDatasets[name].length >= 3 && !this.datasets[name]) {
        return this.loadableDatasets[name][2];
      }
    },
    getDatasets() {
      if (window.nnvpDebugDatasets) console.log('[BottomTrainer] getDatasets called, returning:', Object.keys(this.datasets || {}));
      return this.datasets || {};
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
