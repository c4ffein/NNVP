<template>
  <div id="TrainingZone" class="TrainingZone">
    <div id="trainer-bar" class="TrainingZone">
      <div
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'DatasetSelector' }"
        v-on:click="datasetClicked"
      >
        Dataset
      </div>
      <div
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'CompileOptions' }"
        v-on:click="compileOptionsClicked"
      >
        Options
      </div>
      <div
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'Charts' }"
        v-on:click="chartsClicked"
      >
        Charts
      </div>
      <div
        v-if="benchMode"
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'BenchPanel' }"
        v-on:click="selectedPanel = 'BenchPanel'"
      >
        Bench
      </div>
      <div
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'InspectPanel' }"
        v-on:click="inspectClicked"
      >
        Inspect
      </div>
      <div
        class="TrainingZone bar-button"
        :class="{ active: selectedPanel === 'HistoryPanel' }"
        v-on:click="selectedPanel = 'HistoryPanel'"
      >
        History
      </div>
    </div>
    <div id="training-zone-selector">
      <keep-alive>
        <component
          v-bind:is="selectedPanel"
          v-bind:ref="'child'+selectedPanel"
          class="tab"
          v-bind:value="selectedDataset"
          @input="(value: unknown) => { if (typeof value === 'string') selectedDataset = value; }"
          v-bind:loadableDatasets="loadableDatasets"
          v-bind:selectedOptimizer="selectedOptimizer"
          @changeSelectedOptimizer="changeSelectedOptimizer"
          v-bind:selectableOptimizers="selectableOptimizers"
          v-bind:optimizerParams="optimizerParams"
          @changeOptimizerParam="changeOptimizerParam"
          v-bind:selectedLoss="selectedLoss"
          v-bind:selectableLosses="selectableLosses"
          @changeSelectedLoss="changeSelectedLoss"
          v-bind:epochs="epochs"
          @changeEpochs="changeEpochs"
          v-bind:isTraining="isTraining"
          @trainClicked="trainClicked"
          v-bind:loadDataset="loadDataset"
          v-bind:getDatasets="getDatasets"
          v-bind:getWarningMessage="getWarningMessage"
          v-bind:batchData="chartData0"
          v-bind:epochData="chartData1"
          v-bind:hasTrainedModel="hasTrainedModel"
          v-bind:getTrainedModel="getTrainedModel"
          v-bind:listRuns="listRuns"
          v-bind:deleteRun="deleteRun"
          v-bind:deleteChoices="deleteRunChoices"
          v-bind:restoreRun="restoreRun"
        ></component>
      </keep-alive>
    </div>
  </div>
</template>

<script lang="ts">
/* eslint-disable */
import { defineComponent } from 'vue';
import { loadTf } from '../../lib/tf/loadTf';
import Dataset from '../../lib/JSDatasets/google-data-loader';
import loadableDatasets from '../../lib/JSDatasets/datasets-sources';
import watchTraining from '../../lib/ModelTrainer/watchTraining';
import { TrainingPrepareError } from '../../lib/Training/engine';
import type { TrainingDataset, TrainingSession } from '../../lib/Training/engine';
import { createTfjsEngine } from '../../lib/Training/tfjsEngine';
import { trainingConfig, snapshotTrainingConfig } from '../../lib/Training/trainingConfig';
import {
  startRun, listRuns as journalListRuns,
} from '../../lib/Training/runJournal';
import type { RunRecord, RunHandle } from '../../lib/Training/runJournal';
import ApiClient from '../../lib/Backend/apiClient';
import { deleteEverywhere, deleteChoicesFor, kindApiFrom } from '../../lib/Backend/sync';
import type { DeleteWhere } from '../../lib/Backend/sync';
import { getRecordStore } from '../../lib/LocalStore/db';

import Charts from './Charts.vue';
import CompileOptions from './CompileOptions.vue';
import DatasetSelector from './DatasetSelector.vue';
import InspectPanel from './InspectPanel.vue';
import BenchPanel from './BenchPanel.vue';
import HistoryPanel from './HistoryPanel.vue';
import { benchModeEnabled } from '../../lib/Training/benchMode';

type DebugWindow = Window & { nnvp?: { debug?: { enableDatasets?: boolean } } };

/** One chart line; watchTraining reassigns these during a fit. */
interface ChartSeries {
  className: string;
  name: string;
  data: (number | undefined)[];
}

interface ChartData {
  labels: number[];
  series: ChartSeries[];
}

/**
 * Instance state kept OFF data() — non-reactive by design: the tf model (and
 * the dataset cache holding tf-touching objects) must never be proxied.
 */
interface TrainingZoneNonReactive {
  /** The trained tf model (session.model); Inspect probes it un-proxied. */
  trainedModel?: unknown;
  /** The graph JSON snapshot trainedModel was generated from. */
  trainedGraphJson?: string | null;
  /** Loaded-dataset cache, lazily created by loadDataset. */
  datasets?: Record<string, Dataset>;
  /** Backend client for the History tab's cloud-delete plumbing. */
  api?: ApiClient;
}

export default defineComponent({
  name: 'TrainingZone',
  components: {
    BenchPanel,
    Charts,
    CompileOptions,
    DatasetSelector,
    HistoryPanel,
    InspectPanel,
  },
  data() {
    return {
      isTraining: false,
      // Reactive availability flag for Inspect mode; the tf model itself is
      // kept OFF data() (this.trainedModel) so Vue never proxies it.
      hasTrainedModel: false,
      cancelRequested: false,
      loadableDatasets: loadableDatasets(this.cdnDir),
      selectableOptimizers: [
        'sgd', 'adagrad', 'adadelta', 'adam', 'adamax', 'rmsprop'
      ],
      selectableLosses: [
        'categoricalCrossentropy',
        'sparseCategoricalCrossentropy',
        'binaryCrossentropy',
        'meanSquaredError',
        'meanAbsoluteError',
      ],
      selectedPanel: "DatasetSelector",
      // The A/B engine benchmark tab: hidden unless ?bench=1 opted this
      // browser in (see lib/Training/benchMode.js).
      benchMode: benchModeEnabled(),
      // Chart data, owned here and passed down to Charts as props; watchTraining
      // reassigns labels/series during a fit and reactivity re-renders the charts.
      chartData0: {
        labels: [],
        series: [{ className: 'acc', name: 'acc', data: [] }, { className: 'loss', name: 'loss', data: [] }],
      } as ChartData,
      chartData1: {
        labels: [],
        series: [
          { className: 'ct-series-acc', name: 'acc', data: [] },
          { className: 'ct-series-val-acc', name: 'val-acc', data: [] },
          { className: 'ct-series-loss', name: 'loss', data: [] },
          { className: 'ct-series-val-loss', name: 'val-loss', data: [] },
        ],
      } as ChartData,
    };
  },
  created() {
    // Components build their own ApiClient (the SaveLoadModal/AccountPanel
    // pattern); kept OFF data() like trainedModel — never proxied.
    (this as unknown as TrainingZoneNonReactive).api = new ApiClient();
  },
  mounted() {
    // Warm up the lazy tfjs load as soon as the Training zone opens, so it is
    // ready by the time the user selects a dataset or starts training.
    loadTf();
  },
  computed: {
    // The compile options live in the trainingConfig module singleton (they
    // must survive closing/reopening this window, and Phase 3 journals them
    // into run records). These get/set proxies keep the existing prop/v-model
    // plumbing to CompileOptions / DatasetSelector untouched.
    selectedDataset: {
      get(): string { return trainingConfig.selectedDataset; },
      set(value: string) { trainingConfig.selectedDataset = value; },
    },
    selectedOptimizer: {
      get(): string { return trainingConfig.selectedOptimizer; },
      set(value: string) { trainingConfig.selectedOptimizer = value; },
    },
    optimizerParams: {
      get(): Record<string, unknown> { return trainingConfig.optimizerParams; },
      set(value: Record<string, unknown>) { trainingConfig.optimizerParams = value; },
    },
    epochs: {
      get(): number { return trainingConfig.epochs; },
      set(value: number) { trainingConfig.epochs = value; },
    },
    selectedLoss: {
      get(): string { return trainingConfig.selectedLoss; },
      set(value: string) { trainingConfig.selectedLoss = value; },
    },
  },
  methods: {
    datasetClicked() {
      if (this.selectedPanel == "DatasetSelector") return;
      this.selectedPanel = "DatasetSelector";
      this.$nextTick(() => {
        (this.$refs.childDatasetSelector as InstanceType<typeof DatasetSelector>).refresh();
      });
    },
    compileOptionsClicked() {
      this.selectedPanel = "CompileOptions";
    },
    chartsClicked() {
      this.selectedPanel = "Charts";
    },
    inspectClicked() {
      this.selectedPanel = "InspectPanel";
    },
    // --- History tab plumbing (HistoryPanel gets everything via props, the
    // BenchPanel pattern — it never imports the journal itself).
    listRuns(): Promise<RunRecord[]> {
      return journalListRuns();
    },
    /**
     * The locations this record can be deleted from (PLAN.md Phase 6): only
     * the ones actually holding it. Progressive enhancement — logged out or
     * any API failure degrades to ['local'] and never throws.
     */
    async deleteRunChoices(record: RunRecord): Promise<DeleteWhere[]> {
      const api = (this as unknown as TrainingZoneNonReactive).api!;
      if (!api.isLoggedIn()) return ['local'];
      try {
        const listed = await api.listRuns();
        const cloudUuids = new Set<string>();
        if (Array.isArray(listed)) {
          for (const entry of listed) {
            const uuid = (entry as { uuid?: unknown } | null)?.uuid;
            if (typeof uuid === 'string' && uuid) cloudUuids.add(uuid);
          }
        }
        return deleteChoicesFor(record, cloudUuids);
      } catch {
        return ['local'];
      }
    },
    deleteRun(uuid: string, where: DeleteWhere): Promise<void> {
      const api = (this as unknown as TrainingZoneNonReactive).api!;
      return deleteEverywhere({
        api: kindApiFrom(api, 'runs'), store: getRecordStore(), kind: 'runs', uuid, where,
      });
    },
    restoreRun(run: RunRecord): void {
      // The exact File>Load path (migrate + saveState first, so restore is
      // undo-able — that saveState IS the safety, no confirm dialog needed).
      this.$boardInterface.loadGraphFromJSON(run.graphJson);
      // Journal snapshots use dataset/optimizer/loss; the config store keys
      // are the selected* names — this mapping is load-bearing.
      trainingConfig.selectedDataset = run.config.dataset;
      trainingConfig.selectedOptimizer = run.config.optimizer;
      trainingConfig.optimizerParams = { ...run.config.optimizerParams };
      trainingConfig.epochs = run.config.epochs;
      trainingConfig.selectedLoss = run.config.loss;
    },
    // The model (and the graph JSON it was generated from) the Inspect panel
    // probes. Returned through a function so the tf model stays un-proxied.
    getTrainedModel(): { model: unknown; graphJson: string | null | undefined } {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      return { model: self.trainedModel, graphJson: self.trainedGraphJson };
    },
    async trainClicked() {
      if (this.isTraining) { this.cancelRequested = true; return; }
      this.chartsClicked();
      this.isTraining = true;
      this.$emit('training-started');
      await this.startTraining();
      this.cancelRequested = false;
      this.isTraining = false;
      this.$emit('training-stopped');
    },
    changeSelectedOptimizer(value: string) {
      this.selectedOptimizer = value;
      // Reset optimizer params when switching optimizers
      this.optimizerParams = {};
    },
    changeOptimizerParam(paramName: string, paramValue: unknown) {
      this.optimizerParams = { ...this.optimizerParams, [paramName]: paramValue };
    },
    changeSelectedLoss(value: string) {
      this.selectedLoss = value;
    },
    changeEpochs(value: number) { this.epochs = value; },
    async startTraining() {
      // The engine (lib/Training) owns model building, compile and fit; this
      // component supplies the options from its UI state and keeps the
      // chart + cancellation wiring (watchTraining) and the error surfaces.
      // Always tfjs for now: the tinygrad engine (lib/Training/tinygradEngine)
      // is not user-exposed — it lives behind the ?bench=1 Bench tab and the
      // make test-webgpu harness until it graduates.
      // Journal the run before anything can fail: every Train click leaves a
      // record, prepare failures included. Journaling itself must never break
      // training — a failed startRun (e.g. IndexedDB denied) degrades to no
      // record, and finish() is idempotent so tangled paths can double-call.
      const graphJson = this.$boardInterface.getGraphJSON();
      const runHandle: RunHandle | null = await startRun({
        engineId: 'tfjs',
        config: snapshotTrainingConfig(),
        graphJson: graphJson || '',
      }).catch((journalError) => {
        console.warn('[TrainingZone] run journal unavailable:', journalError);
        return null;
      });
      const finishRun = (outcome: 'completed' | 'cancelled' | 'error', message?: string) => (
        runHandle?.finish(outcome, message).catch(() => {}) || Promise.resolve()
      );
      const engine = createTfjsEngine({ loadTf });
      let session: TrainingSession;
      try {
        session = await engine.prepare(graphJson, {
          generateCode: () => this.$boardInterface.generateJavascriptNoSave(this.$kerasInterface),
          optimizer: this.selectedOptimizer,
          optimizerParams: this.optimizerParams,
          loss: this.selectedLoss,
          epochs: this.epochs,
        });
      }
      catch (error) {
        // Errors the engine did not tag (tfjs load, compile) used to escape
        // startTraining untouched — keep letting them propagate.
        if (!(error instanceof TrainingPrepareError)) {
          await finishRun('error', String(error));
          throw error;
        }
        await finishRun('error', String(error.cause ?? error));
        if (error.stage === 'create') {
          // Param errors
          alert(error.cause);
          console.error('[TrainingZone] Error creating model:', error.cause);
        }
        else {
          const cause = error.cause as { message?: unknown } | null | undefined;
          alert("Couldn't build the model from the graph — check that Inputs and Outputs exist "
            + `and are connected. (${cause?.message || error.cause})`);
          console.error('[TrainingZone] Error generating model:', error.cause);
          console.error('[TrainingZone] Generated code that failed:\n', error.generatedCode);
        }
        return;
      }
      // Inspect mode: keep the (about to be trained) model and the graph JSON
      // it was generated from — lib/Inspector maps its layers back onto the
      // board through that JSON. Any previous inspection is now stale. The
      // seam allows engines without a tf model (session.model null): Inspect
      // then shows its "train a model first" hint instead of probing one.
      this.$boardInterface.setInspection(null);
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      self.trainedModel = session.model;
      self.trainedGraphJson = session.graphJson;
      this.hasTrainedModel = session.model !== null && session.model !== undefined;

      const datasetName = this.selectedDataset;
      try {
        await this.loadDataset(datasetName);
      }
      catch (error) {
        // A dataset-load failure keeps escaping startTraining untouched, but
        // must not strand the journal record as 'running' forever.
        await finishRun('error', String(error));
        throw error;
      }
      const data = self.datasets![datasetName];
      try {
        await watchTraining(
          this.chartData0, this.chartData1,
          // Dataset satisfies the engine seam at runtime; only its nullable
          // `shape` keeps it from typing as TrainingDataset — hence the cast.
          (callbacks) => session.fit(data as unknown as TrainingDataset, callbacks),
          () => this.cancelRequested,
          'cancelRequested',
          // onEpochEnd is sync — persist fire-and-forget, never blocking a fit.
          (m) => { runHandle?.epoch(m).catch(() => {}); },
        );
        await finishRun('completed');
      }
      catch (error) {
        if (error == "cancelRequested") { await finishRun('cancelled'); return; }
        await finishRun('error', String(error));
        console.error('[TrainingZone] Training error:', error);
        alert(error);
      }
    },
    async loadDataset(name: string, progressionCallback?: (fraction: number) => void) {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      const debugEnabled = (window as DebugWindow).nnvp?.debug?.enableDatasets;
      if (debugEnabled) console.log(`[TrainingZone] loadDataset called for: ${name}`);

      self.datasets = self.datasets || {};
      if (!(name in self.datasets)){
        if (debugEnabled) {
          console.log(`[TrainingZone] Dataset ${name} not cached, loading from:`);
          console.log(`  - Images: ${this.loadableDatasets[name]![0].imagesSpritePath}`);
          console.log(`  - Labels: ${this.loadableDatasets[name]![0].labelsPath}`);
        }

        const newDataset = new Dataset(
          this.loadableDatasets[name]![0].imagesSpritePath,
          this.loadableDatasets[name]![0].imagesSpriteChecksum,
          this.loadableDatasets[name]![0].shape,
          this.loadableDatasets[name]![0].labelsPath,
          this.loadableDatasets[name]![0].labelsChecksum,
          10,  // number of classes
          this.loadableDatasets[name]![0].numDatasetElements,
          this.loadableDatasets[name]![0].numTrainElements,
        );

        if (debugEnabled) console.log(`[TrainingZone] Starting newDataset.load() for: ${name}`);

        try {
          await newDataset.load(progressionCallback);
          self.datasets[name] = newDataset;
          if (debugEnabled) console.log(`[TrainingZone] Dataset ${name} loaded and cached successfully`);
        } catch (error) {
          if (debugEnabled) console.error(`[TrainingZone] Error loading dataset ${name}:`, error);
          throw error;
        }
      } else {
        if (debugEnabled) console.log(`[TrainingZone] Dataset ${name} already cached`);
      }
    },
    getWarningMessage(name: string, progressionCallback?: unknown): string | undefined {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      // `self.datasets!` preserves the historical behavior: before any load,
      // datasets is undefined and a warning-carrying entry would throw here.
      if (this.loadableDatasets[name]!.length >= 3 && !self.datasets![name]) {
        return this.loadableDatasets[name]![2];
      }
    },
    getDatasets(): Record<string, Dataset> {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      const debugEnabled = (window as DebugWindow).nnvp?.debug?.enableDatasets;
      if (debugEnabled) console.log('[TrainingZone] getDatasets called, returning:', Object.keys(self.datasets || {}));
      return self.datasets || {};
    },
  },
  props: {
    trainingZoneSize: Number,
    cdnDir: {
      type: String,
      default: "https://datasets.nnvp.io/datasets/",
    },
  },
  watch: {
    trainingZoneSize (newVal: number | undefined, oldVal: number | undefined) {
      window.dispatchEvent(new Event('resize')); // Needed for svg resize
    }
  },
});
</script>

<style>
@font-face {
  font-family: var(--font-medium); font-weight: var(--font-weight-medium);
  src: url("/assets/fonts/Roboto-Regular-webfont.woff") format("woff");
}
@font-face {
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  src: url("/assets/fonts/Roboto-Thin-webfont.woff") format("woff");
}
#TrainingZone {
  /* Fill the window body: the tab bar is a fixed header, only the selected
     panel below it scrolls (so narrowing the window never hides the tabs). */
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
}
#trainer-bar {
  flex: none;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--panel-border);
  background-color: var(--bg-panel);
}
.TrainingZone.bar-button {
  font-size: 12px;
  line-height: 1;
  padding: 5px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
}
.TrainingZone.bar-button:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}
.TrainingZone.bar-button.active {
  background-color: var(--fill-strong);
  color: var(--fill-strong-text);
}
#training-zone-selector {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.TrainingZone select, .TrainingZone input {
  border: 1px solid var(--input-border);
  height: 26px;
  width: auto;
  border-radius: 0;
  background-color: transparent;
  box-sizing: border-box; /* Needed so that input and select sizes are equals */
}
</style>
