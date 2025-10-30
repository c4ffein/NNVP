<template>
  <div id="DatasetSelector" class="DatasetSelector">
    <div id="dataset-selector-and-description">
      <select
        id="dataset-selector-selector"
        class="DatasetSelector dataset-select"
        v-bind:value="value"
        v-on:change="datasetSet($event.target.value)"
      >
        <option v-bind:key="key" v-for="(item, key) in loadableDatasets" v-bind:value="key">
          {{key}}
        </option>
      </select>
      <div id="dataset-description">{{datasetDescription}}
      </div>
    </div>
    <div id="samples-container">
      <div id="samples-title"></div>
      <div v-if="loadingShown" id="data-selector-loading-bar-container">
        <div
          id="data-selector-loading-bar-contained"
          v-bind:style="{width: loadingPercentage * 100 + '%'}"
        ></div>
      </div>
      <div v-bind:style="{display: loadingShown ? 'none' : 'block'}" id="samples"></div>
    </div>
  </div>
</template>

<script>
import * as tf from '@tensorflow/tfjs';

export default {
  name: 'DatasetSelector',
  props: {
    value: {type: String, default: null},
    loadableDatasets: {type: Object, default: {}},
    getDatasets: {type: Function, default: () => ({})},
    loadDataset: {type: Function, default: () => null},
    getWarningMessage: {type: Function, default: () => null},
  },
  computed: {
    datasetDescription() { return this.loadableDatasets?.[this.value]?.[1] ?? ''; },
  },
  data() {
    return {
      newestSelected: null, // Needed to simplify access before propagation
      neededSamples: null,
      loadingId: 0, // Incrementing ID to cancel stale loading operations
      currentLoadingId: null,
      loadingPercentage: 0,
      loadingShown: true,
    };
  },
  methods: {
    async datasetSet(name) {
      if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] datasetSet called with: ${name}`);

      const warningMessage = this.getWarningMessage(name);
      if (warningMessage) {
        // TODO : better than confirm
        if (!confirm(warningMessage)) { // eslint-disable-line
          document.getElementById('dataset-selector-selector').value = this.value;
          this.value = this.newestSelected;
          if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] User cancelled warning for: ${name}`);
          return;
        }
      }
      this.newestSelected = name;
      this.$emit('input', name);
      const loadId = ++this.loadingId;
      this.currentLoadingId = loadId;
      this.loadingShown = true;

      if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] Starting load for: ${name}, ID: ${loadId}`);

      const updateProgress = (progress, id) => {
        if (id !== this.currentLoadingId) return;
        this.loadingShown = true;
        this.loadingPercentage = progress;
        if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] Loading progress for ${name}: ${(progress * 100).toFixed(1)}%`);
      };
      this.loadDataset(name, x => updateProgress(x, loadId))
        .then(async () => {
          if (this.currentLoadingId !== loadId) {
            if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] Load cancelled for: ${name} (ID mismatch: ${loadId} vs ${this.currentLoadingId})`);
            return;
          }
          if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] Load complete for: ${name}, filling samples...`);
          await this.fillSamples(name);
          this.loadingShown = false;
          if (window.nnvpDebugDatasets) console.log(`[DatasetSelector] Samples filled for: ${name}`);
        })
        .catch(error => {
          if (window.nnvpDebugDatasets) console.error(`[DatasetSelector] Error loading ${name}:`, error);
        });
    },
    // Mostly from https://storage.googleapis.com/tfjs-vis/mnist/dist/index.html
    async fillSamples(name) {
      if (this.value !== name) return;
      const drawArea = document.getElementById('samples');
      if (!drawArea) {
        this.neededSamples = name;
        return;
      }
      drawArea.innerHTML = '';
      const dataset = this.getDatasets()[name];
      if(!dataset) {
        console.error(`Dataset "${name}" not found`);
        drawArea.innerHTML = `<div style="color: #000000; padding: 20px; text-align: center;">Error: Dataset "${name}" could not be loaded</div>`;
        return;
      }
      const examples = dataset.nextTestBatch(40);
      const numExamples = examples.xs.shape[0];
      for (let i = 0; i < numExamples; i += 1) {
        const imageTensor = tf.tidy(
          () => examples.xs.slice([i, 0], [1, examples.xs.shape[1]]).reshape(dataset.shape),
        );
        const canvas = document.createElement('canvas');
        canvas.width = dataset.shape[0]; // eslint-disable-line prefer-destructuring
        canvas.height = dataset.shape[1]; // eslint-disable-line prefer-destructuring
        canvas.style = 'margin: 4px;';
        await tf.browser.toPixels(imageTensor, canvas); // eslint-disable-line
        drawArea.appendChild(canvas);
      }
    },
    refresh() {
      if (this.neededSamples && this.neededSamples === this.newestSelected) {
        this.fillSamples(this.neededSamples);
      }
    },
  },
  mounted() {
    this.newestSelected = this.value;
    setTimeout(() => {
      if (this.newestSelected === this.value) this.datasetSet(this.newestSelected);
    }, 3000);
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
#DatasetSelector {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 40% 60%;
}
#dataset-selector-and-description {
  grid-columns: 1/2;
  display: grid;
  grid-template-rows: auto 1fr;
}
#dataset-selector-and-description {
  grid-rows: 1/2;
}
#samples-container {
  grid-columns: 2/2;
}
#data-selector-loading-bar-container {
  background-color: #ffffff;
  border: 1px solid #000000;
  border-radius: 15px;
  width: calc(100% - 40px);
  height: 23px;
  box-sizing: border-box;
  padding: 2px;
  margin: 20px;
  overflow: hidden;
}
#data-selector-loading-bar-contained {
  background-color: #000000;
  border-radius: 13px;
  height: 100%;
}
.DatasetSelector.dataset-select {
  float: left;
  padding-left: 10px;
  margin: 20px 10px 15px 10px;
  height: 23px;
  box-sizing: border-box;
}
#dataset-description {
  margin: 0px 10px 10px 10px;
  padding: 0;
  border: 0;
  text-align: justify;
  text-justify: auto;
  overflow: auto;
}
#samples {
  margin: 15px 0 0 0;
}
</style>
