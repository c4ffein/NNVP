import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx()],
  server: {
    allowedHosts: true,
    // The cloud backend is same-origin at /api (the SPA never configures a
    // backend URL). In dev, forward it to the Django server; `make backend`
    // at the repo root runs one there.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
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
