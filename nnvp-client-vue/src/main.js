import { createApp } from 'vue'
import App from './App.vue'

import KerasInterface from './lib/KerasInterface/KerasInterface';
import BoardInterface from './lib/BoardInterface/BoardInterface';
import jsonLayersFile from './lib/KerasInterface/generatedKerasLayers.json';
import KeyboardListener from './lib/KeyboardListener/KeyboardListener';

// TensorFlow.js is no longer imported here: it is large and only needed for the
// Training zone, so it is loaded lazily (see src/lib/tf/loadTf.js) to keep the
// initial graph-editor bundle small. The optional CPU-only backend override
// (?backend=cpu / window.__FORCE_CPU_BACKEND__) is applied on first lazy load,
// before any tf op runs.
(() => {
  const app = createApp(App)

  // This file is generated from api/keras_layers.py. Temporary file for early
  // development versions, should later be automatically generated at build time.
  const kerasInterface = new KerasInterface(jsonLayersFile);

  app.config.globalProperties.$kerasInterface = kerasInterface;
  const boardInterface = new BoardInterface();
  app.config.globalProperties.$boardInterface = boardInterface;
  app.config.globalProperties.$keyboardListener = new KeyboardListener(boardInterface, kerasInterface);

  // Initialize debug namespace
  window.nnvp = window.nnvp || {};
  window.nnvp.debug = window.nnvp.debug || {};

  // Expose the interfaces for the e2e tests and manual debugging — dev builds
  // only, so production pages don't hand the full model API to any script.
  if (import.meta.env.DEV) {
    // Legacy globals, kept for backwards compatibility
    window.kerasInterface = kerasInterface;
    window.boardInterface = boardInterface;
    // New structured debug namespace
    window.nnvp.debug.kerasInterface = kerasInterface;
    window.nnvp.debug.boardInterface = boardInterface;
  }

  app.mount('#app')
})();
