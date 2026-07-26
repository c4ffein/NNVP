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
          v-bind:trainingState="trainingState"
          v-bind:pausedBy="pausedBy"
          v-bind:canPause="canPause"
          v-bind:pauseTraining="pauseTraining"
          v-bind:resumeTraining="resumeTraining"
          v-bind:phase2Enabled="phase2Enabled"
          v-bind:phase2Dataset="phase2Dataset"
          v-bind:phase2Epochs="phase2Epochs"
          @changePhase2="changePhase2"
          v-bind:phaseBoundaries="phaseBoundaries"
          v-bind:phaseSamples="phaseSamples"
          v-bind:phaseProgress="phaseProgress"
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
import TextDataset from '../../lib/JSDatasets/text-data-loader';
import loadableDatasets from '../../lib/JSDatasets/datasets-sources';
import type { DatasetSourceConfig } from '../../lib/JSDatasets/datasets-sources';
import { TrainingPrepareError } from '../../lib/Training/engine';
import type { TrainingDataset, TrainingSession } from '../../lib/Training/engine';
import RunController from '../../lib/Training/runController';
import type { RunPhase } from '../../lib/Training/runController';
import generateText from '../../lib/Inspector/generateText';
import type { GenerateModel, GenerateTf } from '../../lib/Inspector/generateText';
import { createTfjsEngine } from '../../lib/Training/tfjsEngine';
import { createWorkerEngine } from '../../lib/Training/workerEngine';
import { settings } from '../../lib/Settings/settings';
import { trainingConfig, snapshotTrainingConfig } from '../../lib/Training/trainingConfig';
import {
  startRun, hideRun, listRuns as journalListRuns,
} from '../../lib/Training/runJournal';
import type { FoldedRun, RunHandle } from '../../lib/Training/runJournal';
import { setStreamLocalOnly } from '../../lib/Events/store';
import ApiClient from '../../lib/Backend/apiClient';
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

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally,
// the main.ts pattern. VITE_DATASETS_CDN is the v0 dataset-source override
// (docs/tasks.md "Dataset registry & sources"): a dev .env.local points it at
// the same-origin /datasets/ to serve corpora locally; unset means production
// CDN. Superseded later by the multi-source registry.
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_DATASETS_CDN?: string } };

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
  datasets?: Record<string, Dataset | TextDataset>;
  /** Backend client for the History tab's cloud-delete plumbing. */
  api?: ApiClient;
  /**
   * The in-flight run's controller (pause/resume/cancel). ONE local run at a
   * time by design — a future multi-run manager would hold remote controllers
   * beside this single local slot (docs/tasks.md "Dataset registry"/journal).
   */
  activeRun?: RunController;
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
      // Pause/resume surface: mirrors the RunController state ('idle' when no
      // run), plus which tab initiated the pause (its Resume button renders
      // there) and whether the session's engine can pause at all.
      trainingState: 'idle' as 'idle' | 'running' | 'paused',
      pausedBy: null as string | null,
      canPause: false,
      // Curriculum surface: epoch indices where a phase ended (chart markers)
      // and the fixed-seed text sample taken at each phase boundary.
      phaseBoundaries: [] as number[],
      phaseSamples: [] as { label: string; text: string }[],
      // Live "where are we" line for the Charts strip: phase + absolute epoch.
      phaseProgress: null as null | {
        phaseIndex: number; phaseCount: number; label: string;
        epochsDone: number; epochsTotal: number;
      },
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
    phase2Enabled: {
      get(): boolean { return trainingConfig.phase2Enabled; },
      set(value: boolean) { trainingConfig.phase2Enabled = value; },
    },
    phase2Dataset: {
      get(): string { return trainingConfig.phase2Dataset; },
      set(value: string) { trainingConfig.phase2Dataset = value; },
    },
    phase2Epochs: {
      get(): number { return trainingConfig.phase2Epochs; },
      set(value: number) { trainingConfig.phase2Epochs = value; },
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
    listRuns(): Promise<FoldedRun[]> {
      return journalListRuns();
    },
    /**
     * The locations this run can be removed from: only the ones actually
     * holding its event stream. 'local' (offered always) is a reversible
     * run.hidden event; 'cloud' appears when the server holds any event of
     * the stream (a one-uuid page probe). Progressive enhancement — logged
     * out or any API failure degrades to ['local'] and never throws.
     */
    async deleteRunChoices(run: FoldedRun): Promise<DeleteWhere[]> {
      const api = (this as unknown as TrainingZoneNonReactive).api!;
      if (!api.isLoggedIn()) return ['local'];
      try {
        const { uuids } = await api.listEventUuids({ streamId: run.uuid, limit: 1 });
        return uuids.length ? ['local', 'cloud', 'both'] : ['local'];
      } catch {
        return ['local'];
      }
    },
    /**
     * 'local'  hides the run (run.hidden — reversible, and it syncs, so the
     *          run hides on every device).
     * 'cloud'  purges the stream server-side (the rare destructive
     *          primitive) and flags the surviving local events localOnly so
     *          sync never re-uploads them behind the user's back.
     * 'both'   purge + hide; the hidden event stays device-private
     *          (localOnly) so pushing it cannot recreate the purged stream.
     * Local events are never destroyed here — hidden, not deleted (PLAN.md
     * decision 6); a local purge UX is deliberately parked.
     */
    async deleteRun(uuid: string, where: DeleteWhere): Promise<void> {
      const api = (this as unknown as TrainingZoneNonReactive).api!;
      const store = getRecordStore();
      if (where === 'cloud' || where === 'both') {
        await api.purgeEventStream(uuid);
        await setStreamLocalOnly(uuid, store);
      }
      if (where === 'local' || where === 'both') {
        await hideRun(uuid, store, { localOnly: where === 'both' });
      }
    },
    restoreRun(run: FoldedRun): void {
      // Orphan folds (no run.started here yet) have nothing to restore; the
      // panel hides the button, this guard keeps the contract airtight.
      if (!run.graphJson || !run.config) return;
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
      // Curriculum fields journal only when enabled; absent = single-phase.
      trainingConfig.phase2Enabled = run.config.phase2Dataset !== undefined;
      if (run.config.phase2Dataset !== undefined) {
        trainingConfig.phase2Dataset = run.config.phase2Dataset;
        trainingConfig.phase2Epochs = run.config.phase2Epochs ?? 10;
      }
    },
    changePhase2(field: 'enabled' | 'dataset' | 'epochs', value: unknown) {
      if (field === 'enabled') this.phase2Enabled = !!value;
      else if (field === 'dataset') this.phase2Dataset = String(value);
      else this.phase2Epochs = Number(value) || 0;
    },
    // The model (and the graph JSON it was generated from) the Inspect panel
    // probes. Returned through a function so the tf model stays un-proxied.
    getTrainedModel(): { model: unknown; graphJson: string | null | undefined } {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      return { model: self.trainedModel, graphJson: self.trainedGraphJson };
    },
    async trainClicked() {
      if (this.isTraining) {
        // Stop: between batches while running (the historical flag), through
        // the controller when the run is sitting paused (no batches to check).
        this.cancelRequested = true;
        (this as unknown as TrainingZoneNonReactive).activeRun?.cancel();
        return;
      }
      this.chartsClicked();
      this.isTraining = true;
      this.$emit('training-started');
      await this.startTraining();
      this.cancelRequested = false;
      this.isTraining = false;
      this.trainingState = 'idle';
      this.pausedBy = null;
      this.$emit('training-stopped');
    },
    /**
     * Pause the in-flight run (engine finishes the batch in flight first).
     * `by` names the tab that asked — its Resume button renders there.
     * Resolves true once actually paused; false when there was nothing to
     * pause or the run finished before the stop landed.
     */
    async pauseTraining(by: string): Promise<boolean> {
      const run = (this as unknown as TrainingZoneNonReactive).activeRun;
      if (!run || this.trainingState !== 'running' || !this.canPause) return false;
      this.pausedBy = by;
      const state = await run.pause();
      if (state !== 'paused') {
        this.pausedBy = null;
        return false;
      }
      return true;
    },
    resumeTraining() {
      (this as unknown as TrainingZoneNonReactive).activeRun?.resume();
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
      // Engine choice is the device-local `trainingEngine` setting (Account
      // panel → Settings): the historical main-thread tfjs engine (default)
      // or the Web Worker one. The tinygrad engine stays un-exposed — it
      // lives behind the ?bench=1 Bench tab until it graduates.
      // Journal the run before anything can fail: every Train click leaves a
      // record, prepare failures included. Journaling itself must never break
      // training — a failed startRun (e.g. IndexedDB denied) degrades to no
      // record, and finish() is idempotent so tangled paths can double-call.
      const engineChoice = settings.get('trainingEngine');
      const graphJson = this.$boardInterface.getGraphJSON();
      const runHandle: RunHandle | null = await startRun({
        engineId: engineChoice,
        config: snapshotTrainingConfig(),
        graphJson: graphJson || '',
      }).catch((journalError) => {
        console.warn('[TrainingZone] run journal unavailable:', journalError);
        return null;
      });
      const finishRun = (outcome: 'completed' | 'cancelled' | 'error', message?: string) => (
        runHandle?.finish(outcome, message).catch(() => {}) || Promise.resolve()
      );
      const engine = engineChoice === 'tfjs-worker'
        ? createWorkerEngine()
        : createTfjsEngine({ loadTf });
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

      // Curriculum: phase 1 is the classic run; an enabled phase 2 continues
      // the SAME warm model on another dataset (pretrain → fine-tune).
      const phaseNames = [this.selectedDataset];
      if (this.phase2Enabled && this.phase2Epochs > 0) phaseNames.push(this.phase2Dataset);
      try {
        for (const name of phaseNames) await this.loadDataset(name);
      }
      catch (error) {
        // A dataset-load failure keeps escaping startTraining untouched, but
        // must not strand the journal record as 'running' forever.
        await finishRun('error', String(error));
        throw error;
      }
      const phaseEpochs = [this.epochs, this.phase2Epochs];
      const phases: RunPhase[] = phaseNames.map((name, index) => ({
        // Dataset satisfies the engine seam at runtime; only its nullable
        // `shape` keeps it from typing as TrainingDataset — hence the cast.
        dataset: self.datasets![name] as unknown as TrainingDataset,
        epochs: phaseEpochs[index]!,
        label: name,
      }));
      // The controller owns the segment loop (pause splits one run into
      // several fits); this component keeps the journal and error surfaces.
      this.canPause = session.capabilities.canPause;
      this.trainingState = 'running';
      this.phaseBoundaries = [];
      this.phaseSamples = [];
      const controller = new RunController({
        session,
        phases,
        chartData0: this.chartData0,
        chartData1: this.chartData1,
        cancelRequested: () => this.cancelRequested,
        stopError: 'cancelRequested',
        // onEpochEnd is sync — persist fire-and-forget, never blocking a fit.
        onEpoch: (m) => {
          runHandle?.epoch(m).catch(() => {});
          const phaseIndex = controller.currentPhaseIndex;
          this.phaseProgress = {
            phaseIndex,
            phaseCount: phases.length,
            label: phases[phaseIndex]!.label,
            epochsDone: controller.epochsCompleted,
            epochsTotal: controller.epochsTotal,
          };
        },
        onStateChange: (state) => {
          this.trainingState = state === 'done' ? 'idle' : state;
          if (state !== 'paused') this.pausedBy = null;
        },
        // The curriculum's money shot: a fixed-seed sample at every phase
        // boundary ("same seed, before vs after fine-tuning"). Text-only and
        // best-effort — a sampling failure must never kill the run.
        onPhaseEnd: async (phaseIndex, phase, epochsDone) => {
          if (phaseIndex < phases.length - 1) this.phaseBoundaries = [...this.phaseBoundaries, epochsDone - 1];
          const phaseDataset = self.datasets![phase.label];
          if (!(phaseDataset instanceof TextDataset) || !session.model) return;
          try {
            const tf = await loadTf();
            const text = await generateText({
              tf: tf as unknown as GenerateTf,
              model: session.model as GenerateModel,
              dataset: phaseDataset,
              seed: 'The ',
              count: 160,
              temperature: 0.8,
            });
            this.phaseSamples = [...this.phaseSamples, {
              label: `after phase ${phaseIndex + 1} (${phase.label}, epoch ${epochsDone})`,
              text: `The ${text}`,
            }];
          } catch (sampleError) {
            console.warn('[TrainingZone] phase-boundary sample failed:', sampleError);
          }
        },
      });
      this.phaseProgress = {
        phaseIndex: 0,
        phaseCount: phases.length,
        label: phases[0]!.label,
        epochsDone: 0,
        epochsTotal: controller.epochsTotal,
      };
      self.activeRun = controller;
      try {
        const outcome = await controller.run();
        await finishRun(outcome);
      }
      catch (error) {
        await finishRun('error', String(error));
        console.error('[TrainingZone] Training error:', error);
        alert(error);
      }
      finally {
        self.activeRun = undefined;
      }
    },
    async loadDataset(name: string, progressionCallback?: (fraction: number) => void) {
      const self = this as unknown as TrainingZoneNonReactive; // non-reactive by design
      const debugEnabled = (window as DebugWindow).nnvp?.debug?.enableDatasets;
      if (debugEnabled) console.log(`[TrainingZone] loadDataset called for: ${name}`);

      self.datasets = self.datasets || {};
      if (!(name in self.datasets)){
        const config = this.loadableDatasets[name]![0];
        if (config.kind === 'text') {
          if (debugEnabled) {
            console.log(`[TrainingZone] Dataset ${name} not cached, loading text from: ${config.textPath}`);
          }
          const newTextDataset = new TextDataset(config.textPath, config.textChecksum, config.seqLen);
          try {
            await newTextDataset.load(progressionCallback);
            self.datasets[name] = newTextDataset;
            if (debugEnabled) console.log(`[TrainingZone] Dataset ${name} loaded and cached successfully`);
          } catch (error) {
            if (debugEnabled) console.error(`[TrainingZone] Error loading dataset ${name}:`, error);
            throw error;
          }
          return;
        }
        const imageConfig: DatasetSourceConfig = config;
        if (debugEnabled) {
          console.log(`[TrainingZone] Dataset ${name} not cached, loading from:`);
          console.log(`  - Images: ${imageConfig.imagesSpritePath}`);
          console.log(`  - Labels: ${imageConfig.labelsPath}`);
        }

        const newDataset = new Dataset(
          imageConfig.imagesSpritePath,
          imageConfig.imagesSpriteChecksum,
          imageConfig.shape,
          imageConfig.labelsPath,
          imageConfig.labelsChecksum,
          10,  // number of classes
          imageConfig.numDatasetElements,
          imageConfig.numTrainElements,
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
      // Optional chaining (was `self.datasets!`): selecting a warning-carrying
      // dataset FIRST — before anything ever loaded — used to throw here,
      // which silently swallowed the selection instead of showing the warning.
      if (this.loadableDatasets[name]!.length >= 3 && !self.datasets?.[name]) {
        return this.loadableDatasets[name]![2];
      }
    },
    getDatasets(): Record<string, Dataset | TextDataset> {
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
      default: () => (import.meta as ImportMetaWithEnv).env?.VITE_DATASETS_CDN
        || "https://datasets.nnvp.io/datasets/",
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
