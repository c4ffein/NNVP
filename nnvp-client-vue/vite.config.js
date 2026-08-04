import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx()],
  // The training worker lazy-imports tfjs (trainingWorker.ts), so its bundle
  // code-splits — Vite's default iife worker format refuses that at build
  // time. ES-module workers are fine on every browser the app targets.
  worker: { format: 'es' },
  server: {
    allowedHosts: true,
    // The cloud backend is same-origin at /api (the SPA never configures a
    // backend URL). In dev, forward it to the Django server; `make backend`
    // at the repo root runs one there.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      // Dataset-source v0 (docs/tasks.md "Dataset registry & sources"): when a
      // dev .env.local points VITE_DATASETS_CDN at the same-origin /datasets/,
      // corpora dropped in public/datasets/ are served locally while the image
      // datasets below keep coming from the production CDN through this proxy
      // (same bytes, so their pinned SRI checksums still pass). Per-directory
      // entries on purpose: a blanket /datasets proxy would shadow public/.
      '/datasets/mnist': { target: 'https://datasets.nnvp.io', changeOrigin: true },
      '/datasets/fashion_mnist': { target: 'https://datasets.nnvp.io', changeOrigin: true },
      '/datasets/cifar10': { target: 'https://datasets.nnvp.io', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Isolate the (large) TensorFlow.js library into its own chunk. It is
        // reached only through a dynamic import() (see src/lib/tf/loadTf.js), so
        // it stays out of the initial graph-editor bundle and is fetched lazily
        // when the Training zone / dataset features are first used.
        manualChunks(id) {
          if (id.includes('node_modules/@tensorflow')) return 'tensorflow';
        }
      }
    }
  }
})
