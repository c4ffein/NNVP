<template>
  <div class="BenchPanel">
    <p class="bench-intro">
      Runs the <strong>current board model</strong> through BOTH training
      engines exactly like the Train button does — same prepare/fit path,
      the selected dataset through the real loader when it fits the board
      (synthetic patterns otherwise; the Data line says which ran), pinned
      to the options both engines accept (SGD momentum 0.9, lr 0.01,
      categorical crossentropy, batch 32, {{ epochs }} epochs). The tinygrad
      column pays its one-time Pyodide boot on the first run of the page.
    </p>
    <p v-if="modelSummary" class="bench-model"><strong>Model:</strong> {{ modelSummary }}</p>
    <p v-if="dataNote" class="bench-model"><strong>Data:</strong> {{ dataNote }}</p>
    <p v-if="softmaxWarning" class="bench-warning">{{ softmaxWarning }}</p>
    <div class="bench-actions">
      <button type="button" class="bench-run" :disabled="running" @click="run">
        {{ running ? runningLabel : 'Run comparison' }}
      </button>
      <label class="bench-epochs">
        epochs
        <input v-model.number="epochs" type="number" min="1" max="50" :disabled="running">
      </label>
    </div>
    <table v-if="rows.length" class="bench-table">
      <thead>
        <tr><th></th><th v-for="row in rows" :key="row.engineId">{{ row.engineId }}</th></tr>
      </thead>
      <tbody>
        <tr>
          <th>backend</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.backendInfo || '—' }}</td>
        </tr>
        <tr>
          <th>backend boot</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.error ? '—' : formatSec(row.bootMs) }}</td>
        </tr>
        <tr>
          <th>prepare (build/trace)</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.error ? '—' : formatSec(row.prepareMs) }}</td>
        </tr>
        <tr>
          <th>fit ({{ epochs }} epochs)</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.error ? '—' : formatSec(row.fitMs) }}</td>
        </tr>
        <tr>
          <th>samples / sec (steady, last epoch)</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.error ? '—' : row.samplesPerSec.toFixed(1) }}</td>
        </tr>
        <tr>
          <th>loss</th>
          <td v-for="row in rows" :key="row.engineId">
            {{ row.error ? '—' : `${row.lossFirst.toFixed(3)} → ${row.lossLast.toFixed(3)}` }}
          </td>
        </tr>
        <tr>
          <th>train acc (final)</th>
          <td v-for="row in rows" :key="row.engineId">{{ formatMetric(row.acc) }}</td>
        </tr>
        <tr>
          <th>val loss (final)</th>
          <td v-for="row in rows" :key="row.engineId">{{ formatMetric(row.valLoss, 3) }}</td>
        </tr>
        <tr>
          <th>val acc (final)</th>
          <td v-for="row in rows" :key="row.engineId">{{ formatMetric(row.valAcc) }}</td>
        </tr>
        <tr>
          <th>descended</th>
          <td v-for="row in rows" :key="row.engineId">{{ row.error ? '—' : (row.descended ? 'yes' : 'no') }}</td>
        </tr>
        <tr v-if="rows.some(row => row.error)">
          <th>error</th>
          <td v-for="row in rows" :key="row.engineId" class="bench-error">{{ row.error || '' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="note" class="bench-note">{{ note }}</p>
  </div>
</template>

<script>
import { createTfjsEngine } from '../../lib/Training/tfjsEngine';
import { createTinygradEngine, graphNumClasses } from '../../lib/Training/tinygradEngine';
import { getSharedRuntime } from '../../lib/TinygradRuntime/runtime';
import {
  datasetCompatible, describeGraph, makeSyntheticDataset, probeMetrics, summarizeRun,
} from '../../lib/Training/abBenchmark';
import { loadTf } from '../../lib/tf/loadTf';

// Options both engines accept (the tinygrad engine refuses anything else);
// epochs comes from the panel's input.
const BENCH_OPTS = {
  optimizer: 'sgd',
  optimizerParams: { learningRate: 0.01, momentum: 0.9 },
  loss: 'categoricalCrossentropy',
  // The tinygrad trace bakes batch 32; give tfjs the same so both engines do
  // the SAME number of gradient updates per epoch — otherwise the loss row
  // compares step counts, not engines.
  batchSize: 32,
};

export default {
  name: 'BenchPanel',
  // From TrainingZone's dynamic <component> prop set: the selected dataset
  // name and the real loader plumbing — the bench trains on the REAL data.
  props: {
    value: { type: String, default: 'MNIST' },
    loadDataset: { type: Function, default: null },
    getDatasets: { type: Function, default: null },
  },
  inheritAttrs: false,
  data() {
    return {
      running: false,
      runningLabel: 'Running…',
      rows: [],
      note: '',
      modelSummary: '',
      softmaxWarning: '',
      dataNote: '',
      epochs: 2,
    };
  },
  methods: {
    formatSec(ms) {
      return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
    },
    formatMetric(value, digits = 2) {
      return Number.isFinite(value) ? value.toFixed(digits) : '—';
    },
    graphShapeAndClasses() {
      const graph = JSON.parse(this.$boardInterface.getGraphJSON());
      const input = (graph.layers || []).find(l => l.kerasLayer && l.kerasLayer.name === 'Input');
      const shape = input && input.kerasLayer.parameterValues && input.kerasLayer.parameterValues.shape;
      if (!Array.isArray(shape) || !shape.length) {
        throw new Error('the board needs an Input layer with a shape to benchmark');
      }
      // Both engines (and the synthetic fallback's labels) need the real
      // class count — the graph's final Dense, exactly as the tinygrad
      // engine derives it. Unsupported heads throw their clear error here.
      return { shape, numClasses: graphNumClasses(graph) };
    },
    // The REAL selected dataset (the same object regular training fits on);
    // synthetic patterns only when the real one is unavailable or does not
    // fit the board — and the Data line says which one ran.
    async resolveDataset(shape, numClasses) {
      if (this.loadDataset && this.getDatasets) {
        try {
          await this.loadDataset(this.value);
          const real = (this.getDatasets() || {})[this.value];
          if (real && datasetCompatible(shape, real.shape, numClasses, real.numClasses)) {
            this.dataNote = `${this.value} (the real dataset, through the real loader — the engines' 500-sample slice per epoch)`;
            return real;
          }
          if (real) {
            this.dataNote = `synthetic patterns (board [${shape}]×${numClasses} classes ≠ ${this.value} [${real.shape}]×${real.numClasses})`;
            return null;
          }
        } catch (error) {
          this.dataNote = `synthetic patterns (loading ${this.value} failed: ${String(error && error.message || error).slice(0, 80)})`;
          return null;
        }
      }
      this.dataNote = 'synthetic patterns (no dataset plumbing available)';
      return null;
    },
    async runEngine(engineId, prepareThunk, realDataset) {
      const row = { engineId };
      try {
        const { shape, numClasses } = this.graphShapeAndClasses();
        // Both backends' one-time boot, timed apart from prepare (tfjs:
        // loadTf, ~0 once warm; tinygrad: the Pyodide boot). Both are
        // memoized, so prepare()'s internal call resolves instantly.
        let bootMs = 0;
        if (engineId === 'tinygrad') {
          if (!navigator.gpu) throw new Error('WebGPU not available in this browser');
          const t = performance.now();
          await getSharedRuntime().init();
          bootMs = performance.now() - t;
        } else {
          const t = performance.now();
          await loadTf();
          bootMs = performance.now() - t;
        }
        const t0 = performance.now();
        const { engine, generateCode } = prepareThunk();
        const session = await engine.prepare(this.$boardInterface.getGraphJSON(), {
          ...BENCH_OPTS, epochs: this.epochs, generateCode,
        });
        const prepareMs = performance.now() - t0;
        const tf = engineId === 'tfjs' ? window.tf : null;
        // Which math actually runs: tfjs half-float WebGL fallbacks are the
        // classic silent trainer-killer (tiny SGD updates vanish in f16).
        if (tf) {
          let precision = '';
          try {
            precision = tf.env().getBool('WEBGL_RENDER_FLOAT32_ENABLED') ? ' (float32)' : ' (FLOAT16 — updates may vanish!)';
          } catch { precision = ''; }
          row.backendInfo = `${tf.getBackend()}${precision}`;
        } else {
          row.backendInfo = 'webgpu';
        }
        // The REAL selected dataset whenever it fits the board — the exact
        // object regular training fits on. Synthetic patterns are the
        // labeled fallback, never the silent default.
        const dataset = realDataset || makeSyntheticDataset({ shape, numClasses, tf });
        const losses = [];
        const epochMs = [];
        const finalLogs = {};
        const t1 = performance.now();
        let epochStart = t1;
        await session.fit(dataset, {
          onBatchEnd: (batch, logs) => { if (Number.isFinite(logs.loss)) losses.push(logs.loss); },
          onEpochEnd: () => {
            const now = performance.now();
            epochMs.push(now - epochStart);
            epochStart = now;
          },
        });
        const fitMs = performance.now() - t1;
        // Final metrics through the ONE shared probe for both engines — the
        // same samples, the same math, dropout off (tfjs's fit-native val
        // numbers are deliberately NOT used: they come from different
        // samples at different times than the tinygrad probe would).
        const pixels = dataset.imageByteSize;
        const heldOutImages = dataset.valImages || dataset.testImages;
        const heldOutLabels = dataset.valLabels || dataset.testLabels;
        try {
          const train = await probeMetrics(session, {
            images: dataset.trainImages, labels: dataset.trainLabels, pixels, numClasses,
          });
          const val = await probeMetrics(session, {
            images: heldOutImages, labels: heldOutLabels, pixels, numClasses,
          });
          finalLogs.acc = train.acc;
          finalLogs.valLoss = val.loss;
          finalLogs.valAcc = val.acc;
        } catch (probeError) {
          console.warn('[bench] metric probe failed:', probeError);
        }
        Object.assign(row, summarizeRun({
          engineId, epochs: this.epochs, bootMs, prepareMs, fitMs, epochMs, losses, finalLogs,
        }));
      } catch (error) {
        row.error = String((error && error.message) || error);
      }
      this.rows = [...this.rows.filter(r => r.engineId !== engineId), row];
    },
    async run() {
      this.running = true;
      this.rows = [];
      this.note = '';
      try {
        const description = describeGraph(this.$boardInterface.getGraphJSON());
        this.modelSummary = description.summary;
        let shape;
        let numClasses;
        try {
          ({ shape, numClasses } = this.graphShapeAndClasses());
        } catch (error) {
          this.note = `Cannot benchmark this graph: ${String((error && error.message) || error)}`;
          return;
        }
        const realDataset = await this.resolveDataset(shape, numClasses);
        this.softmaxWarning = description.finalSoftmax ? '' : (
          '⚠ The final Dense has no softmax activation: tfjs\' categoricalCrossentropy '
          + 'expects probabilities and will train poorly/garbage on raw logits, while the '
          + 'tinygrad engine always trains on logits and stays correct. Add '
          + 'activation=softmax to the last Dense for an apples-to-apples run.'
        );
        this.runningLabel = 'Running tfjs…';
        await this.runEngine('tfjs', () => ({
          engine: createTfjsEngine({ loadTf }),
          generateCode: () => this.$boardInterface.generateJavascriptNoSave(this.$kerasInterface),
        }), realDataset);
        this.runningLabel = 'Running tinygrad (boot + trace can take ~30s)…';
        await this.runEngine('tinygrad', () => ({
          engine: createTinygradEngine(),
          generateCode: () => this.$boardInterface.generateTinygradNoSave(this.$kerasInterface),
        }), realDataset);
        this.note = 'Same data, same options, real engine code paths; acc/val rows come from '
          + 'one shared probe (same samples, dropout off) for both engines. tfjs\'s fit time '
          + 'includes its built-in per-epoch validation (that IS its regular workflow); '
          + 'tinygrad re-traces per architecture edit, and its boot is once per page.';
      } finally {
        this.running = false;
        this.runningLabel = 'Running…';
      }
    },
  },
};
</script>

<style>
.BenchPanel {
  padding: 14px 18px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.bench-intro { margin: 0 0 10px; color: var(--text-muted); max-width: 640px; }
.bench-model { margin: 0 0 8px; max-width: 640px; }
.bench-warning { margin: 0 0 10px; color: #b45309; max-width: 640px; }
.bench-actions { margin-bottom: 12px; }
.bench-run { cursor: pointer; }
.bench-run:disabled { opacity: 0.6; cursor: default; }
.bench-epochs { margin-left: 10px; font-size: 12px; color: var(--text-muted); }
.bench-epochs input { width: 56px; margin-left: 4px; }
.bench-table { border-collapse: collapse; }
.bench-table th, .bench-table td {
  border: 1px solid var(--panel-border);
  padding: 4px 12px;
  text-align: left;
}
.bench-table thead th { font-weight: var(--font-weight-semibold); }
.bench-error { color: #b91c1c; max-width: 320px; }
.bench-note { color: var(--text-muted); margin-top: 10px; max-width: 640px; }
</style>
