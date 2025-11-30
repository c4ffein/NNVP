<template>
  <div id="TrainingZone" class="TrainingZone">
    <div id="trainer-bar" class="TrainingZone">
      <div class="TrainingZone bar-button" v-on:click="datasetClicked">
        Dataset
      </div>
      <div class="TrainingZone bar-button" v-on:click="compileOptionsClicked">
        Options
      </div>
      <div class="TrainingZone bar-button" v-on:click="chartsClicked">
        Charts
      </div>
      <div id="button-close-trainer" v-on:click="$emit('close-trainer')">╳</div>
    </div>
    <div id="training-zone-selector">
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
          v-bind:optimizerParams="optimizerParams"
          @changeOptimizerParam="changeOptimizerParam"
          v-bind:selectedLoss="selectedLoss"
          v-bind:selectableLosses="selectableLosses"
          @changeSelectedLoss="changeSelectedLoss"
          v-bind:epochs="epochs"
          @changeEpochs="changeEpochs"
          v-bind:isTraining="isTraining"
          @trainClicked="trainClicked"
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

import Charts from './Charts.vue';
import CompileOptions from './CompileOptions.vue';
import DatasetSelector from './DatasetSelector.vue';

export default {
  name: 'TrainingZone',
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
      optimizerParams: {},
      epochs: 10,
      selectableOptimizers: [
        'sgd', 'adagrad', 'adadelta', 'adam', 'adamax', 'rmsprop'
      ],
      selectedLoss: 'categoricalCrossentropy',
      selectableLosses: [
        'categoricalCrossentropy',
        'sparseCategoricalCrossentropy',
        'binaryCrossentropy',
        'meanSquaredError',
        'meanAbsoluteError',
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
    console.log('[TrainingZone] Chart data initialized');
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
    changeSelectedOptimizer(value) {
      this.selectedOptimizer = value;
      // Reset optimizer params when switching optimizers
      this.optimizerParams = {};
    },
    changeOptimizerParam(paramName, paramValue) {
      this.optimizerParams = { ...this.optimizerParams, [paramName]: paramValue };
    },
    changeSelectedLoss(value) {
      this.selectedLoss = value;
    },
    changeEpochs(value) { this.epochs = value; },
    async startTraining() {
      window.tf = tf;
      const optimizer = this.selectedOptimizer;
      const epochs = this.epochs;
      let createModel;
      let generatedCode;
      try {
        // NOTE: Using eval here to execute the generated JavaScript code from the visual graph editor.
        // The graph is converted to TensorFlow.js code (as a string), then eval'd to get a runnable function.
        // This is currently safe since the code is generated from the user's own graph structure,
        // but could be replaced with direct model building from the graph JSON to avoid eval entirely.
        generatedCode = this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface);
        console.log('[TrainingZone] Generated JavaScript code:\n', generatedCode);
        createModel = eval(
          `(function() { const tf = window.tf; ${generatedCode} return createModel; })()`
        );
      }
      catch (error) {
        alert("Incorrect network : couldn't find Inputs/Outputs, or they weren't connected.");
        console.error('[TrainingZone] Error generating model:', error);
        console.error('[TrainingZone] Generated code that failed:\n', generatedCode);
        return;
      }
      let model;
      try {
        model = createModel();
      }
      catch (error) {
        // Param errors
        alert(error);
        console.error('[TrainingZone] Error creating model:', error);
        return;
      }
      // Build optimizer config with parameters
      let optimizerConfig = optimizer;
      const filteredParams = Object.fromEntries(
        Object.entries(this.optimizerParams).filter(([k, v]) => v !== undefined && v !== null && v !== '')
      );
      if (Object.keys(filteredParams).length > 0) {
        optimizerConfig = window.tf.train[optimizer](filteredParams);
      }
      console.log('[TrainingZone] Compiling model with optimizer:', optimizer, 'params:', this.optimizerParams);

      // Expose compilation config for testing/debugging
      window.nnvp = window.nnvp || {};
      window.nnvp.debug = window.nnvp.debug || {};
      window.nnvp.debug.trainingConfig = {
        optimizer,
        optimizerParams: filteredParams,
        loss: this.selectedLoss,
        epochs: this.epochs,
      };

      model.compile({
        optimizer: optimizerConfig,
        loss: this.selectedLoss,
        metrics: ['accuracy'],
      });
      console.log('[TrainingZone] Model compiled successfully');

      // Expose compiled model configuration for testing
      window.nnvp.debug.compiledModel = {
        optimizerConfig: model.optimizer.getConfig(),
        loss: model.loss,
      };

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

        // Debug: Log actual TensorFlow.js training configuration
        const debugEnabled = window.nnvp?.debug?.enableTraining;
        if (debugEnabled) {
          const optimizerConfig = model.optimizer.getConfig();
          console.log('[TrainingZone] Starting training with TensorFlow.js configuration:');
          console.log('[TrainingZone]   Optimizer:', model.optimizer.getClassName());
          console.log('[TrainingZone]   Learning Rate:', optimizerConfig.learningRate?.learningRate || optimizerConfig.learningRate);
          console.log('[TrainingZone]   Loss:', model.loss);
          console.log('[TrainingZone]   Epochs:', epochs);
          console.log('[TrainingZone]   Batch Size:', BATCH_SIZE);
        }

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
        console.error('[TrainingZone] Training error:', error);
        alert(error);
      }
    },
    async loadDataset(name, progressionCallback) {
      const debugEnabled = window.nnvp?.debug?.enableDatasets;
      if (debugEnabled) console.log(`[TrainingZone] loadDataset called for: ${name}`);

      this.datasets = this.datasets || {};
      if (!(name in this.datasets)){
        if (debugEnabled) {
          console.log(`[TrainingZone] Dataset ${name} not cached, loading from:`);
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

        if (debugEnabled) console.log(`[TrainingZone] Starting newDataset.load() for: ${name}`);

        try {
          await newDataset.load(progressionCallback);
          this.datasets[name] = newDataset;
          if (debugEnabled) console.log(`[TrainingZone] Dataset ${name} loaded and cached successfully`);
        } catch (error) {
          if (debugEnabled) console.error(`[TrainingZone] Error loading dataset ${name}:`, error);
          throw error;
        }
      } else {
        if (debugEnabled) console.log(`[TrainingZone] Dataset ${name} already cached`);
      }
    },
    getWarningMessage(name, progressionCallback) {
      if (this.loadableDatasets[name].length >= 3 && !this.datasets[name]) {
        return this.loadableDatasets[name][2];
      }
    },
    getDatasets() {
      const debugEnabled = window.nnvp?.debug?.enableDatasets;
      if (debugEnabled) console.log('[TrainingZone] getDatasets called, returning:', Object.keys(this.datasets || {}));
      return this.datasets || {};
    },
  },
  props: {
    trainingZoneSize: Number,
    cdnDir: {
      type: String,
      default: "https://datasets.nnvp.io/datasets/",
    },
  },
  watch: {
    trainingZoneSize (newVal, oldVal) {
      window.dispatchEvent(new Event('resize')); // Needed for svg resize
    }
  },
};
</script>

<style>
@font-face {
  font-family: var(--font-medium); font-weight: var(--font-weight-medium);
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#TrainingZone {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  display: grid;
  grid-template-rows: 24px 1fr;
  color: #000000;
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
.TrainingZone.bar-button{
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
#training-zone-selector {
  grid-rows: 2/2;
}
.TrainingZone select, .TrainingZone input {
  border: 1px solid rgba(100, 100, 100, 0.3);
  height: 26px;
  width: auto;
  border-radius: 0;
  background-color: rgba(100, 100, 100, 0);
  box-sizing: border-box; /* Needed so that input and select sizes are equals */
}
</style>
