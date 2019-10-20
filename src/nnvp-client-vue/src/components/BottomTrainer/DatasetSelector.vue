<template>
  <div id="DatasetSelector" class="DatasetSelector">
    <div id="dataset-selector-and-description">
      <select
        class="BottomTrainer dataset-select"
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
      this.newestSelected = name;
      this.$emit('input', name);
      this.$parent.loadDataset(name).then(() => this.fillSamples(name));
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
      const examples = this.$parent.datasets[name].nextTestBatch(40);
      const numExamples = examples.xs.shape[0];
      for (let i = 0; i < numExamples; i += 1) {
        const imageTensor = tf.tidy(
          () => examples.xs.slice([i, 0], [1, examples.xs.shape[1]]).reshape([28, 28, 1]),
        );
        const canvas = document.createElement('canvas');
        canvas.width = 28;
        canvas.height = 28;
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
.dataset-select {
  border: 1px solid rgba(100, 100, 100, 0.3);
  float: left;
  height: 26px;
  width: auto;
  border-radius: 0;
  background-color: rgba(100, 100, 100, 0);
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
