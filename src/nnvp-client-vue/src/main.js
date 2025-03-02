import { Vue, createApp } from 'vue'
import './style.css'
import App from './App.vue'

import KerasInterface from './lib/KerasInterface/KerasInterface';
import D3Interface from './lib/D3Interface/D3Interface';
import jsonLayersFile from './lib/KerasInterface/generatedKerasLayers.json';
import KeyboardListener from './lib/KeyboardListener/KeyboardListener';

Vue.config.productionTip = false;  // TODO Check

// This file is generated from api/keras_layers.py. Temporary file for early
// development versions, should later be automatically generated at build time.
const kerasInterface = new KerasInterface(jsonLayersFile);

Object.defineProperty(Vue.prototype, '$kerasInterface', { value: kerasInterface });
const d3Interface = new D3Interface();
Object.defineProperty(Vue.prototype, '$d3Interface', { value: d3Interface });
Object.defineProperty(Vue.prototype, '$keyboardListener', { value: new KeyboardListener(d3Interface, kerasInterface) });


createApp(App).mount('#app')
