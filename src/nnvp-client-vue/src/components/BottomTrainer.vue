<template>
  <div id="BottomTrainer" class="BottomTrainer">
    <div id="BottomTrainerBar" class="BottomTrainer">
      <select class="BottomTrainer bar-button" v-model="selectedDataset">
        <option v-bind:key="key" v-for="(item, key) in loadedDatasets" v-bind:value="key">
          {{key}}
        </option>
      </select>
      <button class="BottomTrainer bar-button" v-on:click="startTraining">
        {{isTraining ? 'Stop' : 'Train'}}
      </button>
      <div class="BottomTrainer bar-button" id="experimental-warning">
        Warning : experimental feature
      </div>
      <button id="button-close-trainer" v-on:click="$emit('close-trainer')">╳</button>
    </div>
  </div>
</template>

<script>
/* eslint-disable */
import * as tf from '@tensorflow/tfjs';
import * as tfvis from '@tensorflow/tfjs-vis';

import { IMAGE_H, IMAGE_W, MnistData } from '../lib/JSDatasets/google-mnist-data';

export default {
  name: 'BottomTrainer',
  data() {
    return {
      isTraining: false,
      selectedDataset: 'MNIST Data',
      loadedDatasets: {
        'MNIST Data': '', // MnistData, empty for now...
      },
    };
  },
  methods: {
    async startTraining() {
      this.isTraining = !this.isTraining;
      if (!this.isTraining) return;
      window.tf = tf;
      const createModel = eval(
        `tf=window.tf;\n${this.$d3Interface.generateJavascriptNoSave(this.$kerasInterface)}createModel`,
      );
      const model = createModel();
      const optimizer = 'rmsprop'; // TODO : allow to set
      model.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      // const data = new this.loadedDatasets[this.selectedDataset]();
      const data = new MnistData();
      await data.load();
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
          epochs: 10,
          shuffle: true,
          callbacks: fitCallbacks,
        });
      }
      // await train(model, data, i => console.log("hohoho" + i)); // ONO :(
      async function watchTraining() {
        const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
        const container = {
          name: 'show.fitCallbacks', tab: 'Training', styles: { height: '1000px' },
        };
        const callbacks = tfvis.show.fitCallbacks(container, metrics);
        return train(model, data, callbacks);
      }
      await watchTraining();
    },
    switch() {
      this.isTraining = !this.isTraining;
    },
  },
  mounted() {
    // You know, I love clean code. Effective, concise, beautiful.
    // But sometimes, a prototype needs to be written on time.
    const visorInstance = tfvis.visor();
    if (!visorInstance.isOpen()) {
      visorInstance.toggle();
    }
    visorInstance.unbindKeys();
    const visorContainer = document.getElementById('tfjs-visor-container');
    document.getElementById('BottomTrainer').appendChild(visorContainer);
    visorContainer.style.height = '100%';
    visorContainer.children[0].style.position = 'relative';
    visorContainer.children[0].style.height = '100%';
    visorContainer.children[0].style.width = '100%';
    visorContainer.children[0].style.padding = 0;
    visorContainer.children[0].children[0].style.display = 'none'; // Don't show default controls
    visorContainer.children[0].children[1].style.display = 'none'; // Don't show default tab switch
    visorContainer.children[0].children[2].style.padding = 0;
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
  display: flex;
  flex-flow: column;
  width: 100%;
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
.BottomTrainer.bar-button{
  float: left;
  height: 26px;
  width: 166px;
  border-radius: 0;
  border: none;
  border-right: 1px solid rgba(100, 100, 100, 0.3);
  background-color: rgba(100, 100, 100, 0);
  padding-left: 10px;
}
#experimental-warning {
  border: none;
  padding-left: 30px;
}
#experimental-warning:hover {
  background-color: rgba(100, 100, 100, 0.0);
}
#button-close-trainer{
  float: right;
  border: none;
  line-height: 26px;
  transform: translate(0, -12%);
}
</style>
