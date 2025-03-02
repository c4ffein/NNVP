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
  props: {value: {type: String, default: null}, loadableDatasets: {type: Array, default: []}},
  computed: {
    datasetDescription() { return this.loadableDatasets?.[this.value]?.[1] ?? ''; },
  },
  data() {
    return {
      newestSelected: null, // Needed to simplify access before propagation
      neededSamples: null,
      loadingToken: null, // Will not be needed anymore when loading will be cancellable
      loadingPercentage: 0,
      loadingShown: true,
    };
  },
  methods: {
    async datasetSet(name) {
      const warningMessage = this.$parent.getWarningMessage(name);
      if (warningMessage) {
        // TODO : better than confirm
        if (!confirm(warningMessage)) { // eslint-disable-line
          document.getElementById('dataset-selector-selector').value = this.value;
          this.value = this.newestSelected;
          return;
        }
      }
      this.newestSelected = name;
      this.$emit('input', name);
      const randomChecker = Math.random(); // TODO : better solution than using a token
      this.loadingToken = randomChecker;
      this.loadingShown = true;
      const updateProgressCheckRandom = (progress, random) => {
        if (random !== this.loadingToken) return;
        this.loadingShown = true;
        this.loadingPercentage = progress;
      };
      this.$parent.loadDataset(name, x => updateProgressCheckRandom(x, randomChecker))
        .then(async () => {
          if (this.loadingToken !== randomChecker) return;
          await this.fillSamples(name);
          this.loadingShown = false;
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
      const datasets = this.$parent.datasets[name];
      const examples = datasets.nextTestBatch(40);
      const numExamples = examples.xs.shape[0];
      for (let i = 0; i < numExamples; i += 1) {
        const imageTensor = tf.tidy(
          () => examples.xs.slice([i, 0], [1, examples.xs.shape[1]]).reshape(datasets.shape),
        );
        const canvas = document.createElement('canvas');
        canvas.width = datasets.shape[0]; // eslint-disable-line prefer-destructuring
        canvas.height = datasets.shape[1]; // eslint-disable-line prefer-destructuring
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
  font-family: "Roboto Regular";
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: "Roboto Thin";
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#DatasetSelector {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: "Roboto Thin";
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
  background-color: rgba(100, 100, 100, 0.3);
  width: calc(100% - 40px);
  height: 23px;
  box-sizing: border-box;
  padding: 1px;
  margin: 20px;
}
#data-selector-loading-bar-contained {
  background-color: rgba(255, 255, 255, 1);
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
