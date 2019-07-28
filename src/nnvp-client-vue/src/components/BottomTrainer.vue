<template>
  <div id="BottomTrainer" class="BottomTrainer">
    <div id="BottomTrainerBar" class="BottomTrainer">
      <select id="select-dataset" v-model="selectedDataset">
        <option v-bind:key="key" v-for="(item, key) in loadedDatasets" v-bind:value="key">
          {{key}}
        </option>
      </select>
      <button id="button-launch-training">Train</button>
      <button id="button-close-trainer" v-on:click="$emit('close-trainer')">╳</button>
    </div>
    <div>Work in progress</div>

  </div>
</template>

<script>
export default {
  name: 'BottomTrainer',
  data() {
    return {
      selectedDataset: 'Choice 1',
      loadedDatasets: {
        'Choice 1': 'test1',
        'Choice 2': 'test2',
        'Choice 3': 'test3',
      },
    };
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
}
#BottomTrainerBar {
  height: 26px;
  overflow: hidden;
  border-bottom: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0.2);
}
#BottomTrainerBar > * {
  background-color: rgba(100, 100, 100, 0);
}
#BottomTrainerBar > *:hover {
  background-color: rgba(100, 100, 100, 0.1);
}
#select-dataset, #button-launch-training{
  float: left;
  height: 26px;
  width: 166px;
  border-radius: 0;
  border: none;
  border-right: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0);
  padding-left: 10px;
}
#button-close-trainer{
  float: right;
  border: none;
  line-height: 26px;
  transform: translate(0, -12%);
}
</style>
