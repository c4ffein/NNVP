import Vue from 'vue';
import App from './App.vue';

import KerasInterface from './lib/KerasInterface/KerasInterface';
import D3Interface from './lib/D3Interface/D3Interface';
import jsonLayersFile from './lib/KerasInterface/generatedKerasLayers.json';
import KeyboardListener from './lib/KeyboardListener/KeyboardListener';

Vue.config.productionTip = false;
// This file is generated from api/keras_layers.py. Temporary file for early
// development versions, should later be automatically generated at build time.

Object.defineProperty(Vue.prototype, '$kerasInterface', { value: new KerasInterface(jsonLayersFile) });
const d3Interface = new D3Interface();
Object.defineProperty(Vue.prototype, '$d3Interface', { value: d3Interface });
Object.defineProperty(Vue.prototype, '$keyboardListener', { value: new KeyboardListener(d3Interface) });

new Vue({
  render: h => h(App),
}).$mount('#app');
