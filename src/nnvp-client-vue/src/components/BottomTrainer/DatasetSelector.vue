<template>
  <div id="DatasetSelector" class="DatasetSelector">
    <div id="dataset-selector-and-description">
      <select
        class="BottomTrainer dataset-select"
        v-bind:value="value"
        v-on:change="newSelected=$event.target.value;$emit('input', $event.target.value)"
      >
        <option v-bind:key="key" v-for="(item, key) in loadedDatasets" v-bind:value="key">
          {{key}}
        </option>
      </select>
      <div id="dataset-description">
        {{loadedDatasets[value][1]}}
      </div>
    </div>
    <div id="samples-container">
      <div id="samples-title"></div>
      <div id="samples">WiP</div>
    </div>
  </div>
</template>

<script>
/* eslint-disable */
import * as tf from '@tensorflow/tfjs';
import Dataset from '../../lib/JSDatasets/google-data-loader';

export default {
  name: 'DatasetSelector',
  props: ['value', 'loadedDatasets'],
}
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
</style>
