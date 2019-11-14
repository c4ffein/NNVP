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
      <div id="dataset-description">
        {{loadableDatasets[value][1]}}
      </div>
    </div>
    <div id="samples-container">
      <div id="samples-title"></div>
      <div id="samples"></div>
    </div>
  </div>
</template>

<script>
import * as tf from '@tensorflow/tfjs';

export default {
  name: 'DatasetSelector',
  props: ['value', 'loadableDatasets'],
  data() {
    return {
      newestSelected: null, // Needed to simplify access before propagation
      neededSamples: null,
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
      this.$parent.loadDataset(name /* x => console.log(x) */).then(() => this.fillSamples(name));
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
    setTimeout(() => this.datasetSet(this.newestSelected), 3000);
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
.DatasetSelector.dataset-select {
  float: left;
  padding-left: 10px;
  margin: 20px 10px 15px 10px;
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
