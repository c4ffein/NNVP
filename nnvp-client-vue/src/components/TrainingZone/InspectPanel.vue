<template>
  <div id="InspectPanel" class="InspectPanel">
    <!-- This tab initiated the pause — its Resume lives here (Charts points at us). -->
    <div
      v-if="trainingState === 'paused' && pausedBy === 'Inspect'"
      class="inspect-row inspect-resume-row"
      data-testid="inspect-resume-row"
    >
      <span class="inspect-paused-note">Training paused for inspection.</span>
      <button
        class="inspect-button inspect-run"
        data-testid="inspect-resume-button"
        v-on:click="resumeTraining()"
      >▶ Resume training</button>
    </div>
    <div v-if="!hasTrainedModel" class="inspect-hint" data-testid="inspect-no-model-hint">
      Train a model first — Inspect runs a dataset sample through your trained
      network and shows each layer's activations on the board.
    </div>
    <div v-else-if="!datasetReady" class="inspect-hint" data-testid="inspect-no-dataset-hint">
      Load a dataset in the Dataset tab first.
    </div>
    <div v-else-if="isTextDataset" class="inspect-controls" data-testid="inspect-text-mode">
      <div class="inspect-row">
        <label for="inspect-seed-input">Seed</label>
        <textarea
          id="inspect-seed-input"
          class="inspect-seed"
          rows="2"
          aria-label="Seed text"
          v-model="seedText"
          v-bind:disabled="generating"
        ></textarea>
      </div>
      <div class="inspect-row">
        <label for="inspect-temperature-input">Temperature</label>
        <input
          id="inspect-temperature-input"
          type="number"
          step="0.1"
          min="0"
          max="2"
          aria-label="Sampling temperature"
          v-model.number="temperature"
        />
      </div>
      <div class="inspect-row">
        <button
          class="inspect-button"
          v-bind:disabled="generating"
          v-on:click="generateChars(1)"
        >Step</button>
        <button
          class="inspect-button inspect-run"
          v-if="!generating"
          v-on:click="generateChars(120)"
        >Generate</button>
        <button
          class="inspect-button inspect-run"
          v-else
          v-on:click="stopGenerating"
        >Stop</button>
        <button
          class="inspect-button"
          v-bind:disabled="generating || (!generatedText && !inspectionShown)"
          v-on:click="clearGenerated"
        >Clear</button>
      </div>
      <pre
        class="inspect-generated"
        data-testid="inspect-generated-text"
      ><span class="inspect-generated-seed">{{ seedText }}</span>{{ generatedText }}</pre>
      <div v-if="errorMessage" class="inspect-error" role="alert">{{ errorMessage }}</div>
    </div>
    <div v-else class="inspect-controls">
      <div class="inspect-row">
        <label for="inspect-class-select">Class</label>
        <select
          id="inspect-class-select"
          aria-label="Sample class"
          v-bind:value="selectedClass"
          v-on:change="selectClass(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-bind:key="cls" v-for="cls in numClasses" v-bind:value="cls - 1">
            {{ cls - 1 }}
          </option>
        </select>
        <button class="inspect-nav-button" aria-label="Previous sample" v-on:click="step(-1)">
          &#x2039;
        </button>
        <span class="inspect-sample-position">{{ sampleNumber + 1 }} / {{ classCount }}</span>
        <button class="inspect-nav-button" aria-label="Next sample" v-on:click="step(1)">
          &#x203A;
        </button>
      </div>
      <canvas ref="previewCanvas" class="inspect-preview" aria-label="Sample preview"></canvas>
      <div class="inspect-row">
        <button
          class="inspect-button inspect-run"
          v-bind:disabled="busy"
          v-on:click="inspect()"
        >{{ busy ? 'Inspecting…' : 'Inspect' }}</button>
        <button
          class="inspect-button"
          v-bind:disabled="!inspectionShown"
          v-on:click="clearInspection"
        >Clear</button>
      </div>
      <div v-if="errorMessage" class="inspect-error" role="alert">{{ errorMessage }}</div>
    </div>

    <!-- Interaction while training runs: offer to pause first (the model's
         weights are mid-flight; pausing gives a stable state to probe). -->
    <div v-if="pausePrompt" class="inspect-pause-overlay" @click.self="cancelPausePrompt">
      <div
        class="inspect-pause-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pause training to inspect"
      >
        <div class="inspect-pause-message">
          Training is running. Pause it to inspect the model at its current state?
        </div>
        <div class="inspect-pause-buttons">
          <button class="inspect-button" v-on:click="cancelPausePrompt">Keep training</button>
          <button
            class="inspect-button inspect-run"
            data-testid="inspect-pause-confirm"
            v-on:click="confirmPausePrompt"
          >Pause &amp; inspect</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { loadTf } from '../../lib/tf/loadTf';
import { buildProbe, inputEntries, runInspection } from '../../lib/Inspector/probe';
import type { InspectionEntry, ProbeSourceModel, ProbeTf } from '../../lib/Inspector/probe';
import { buildClassIndex, sampleAt } from '../../lib/Inspector/datasetSamples';
import { drawSample } from '../../lib/Inspector/drawInspection';
import { sampleFromProbs } from '../../lib/Inspector/textSampler';
import type Dataset from '../../lib/JSDatasets/google-data-loader';
import TextDataset from '../../lib/JSDatasets/text-data-loader';
import { indexToChar } from '../../lib/JSDatasets/text-vocab';
import type { NnvpLayerId } from '../../types/model';

/** What TrainingZone.getTrainedModel hands over (the tf model, un-proxied). */
interface TrainedModelRef {
  model: unknown;
  graphJson: string | null;
}

/** Instance state kept OFF data() — non-reactive by design (never proxied). */
interface InspectPanelNonReactive {
  /** per-class test-sample positions */
  classIndex: number[][] | null;
  onVizParamsChanged?: () => void;
}

export default defineComponent({
  name: 'InspectPanel',
  props: {
    value: { type: String, default: null }, // selected dataset name
    getDatasets: {
      type: Function as PropType<() => Record<string, Dataset | TextDataset>>,
      default: () => ({}),
    },
    hasTrainedModel: { type: Boolean, default: false },
    getTrainedModel: {
      type: Function as PropType<() => TrainedModelRef | null>,
      default: () => null,
    },
    // Pause/resume surface (TrainingZone's run controller).
    trainingState: { type: String, default: 'idle' },
    pausedBy: { type: String as PropType<string | null>, default: null },
    canPause: { type: Boolean, default: false },
    pauseTraining: {
      type: Function as PropType<(by: string) => Promise<boolean>>,
      default: () => Promise.resolve(false),
    },
    resumeTraining: { type: Function as PropType<() => void>, default: () => {} },
  },
  data() {
    return {
      datasetReady: false,
      isTextDataset: false,
      numClasses: 0,
      classCount: 0,
      selectedClass: 0,
      sampleNumber: 0,
      inspectionShown: false,
      busy: false,
      errorMessage: null as string | null,
      // Text (generation) mode state.
      seedText: 'The ',
      temperature: 0.8,
      generatedText: '',
      generating: false,
      // Pending action behind the "pause to inspect?" modal.
      pausePrompt: null as { type: 'inspect' } | { type: 'generate'; count: number } | null,
    };
  },
  created() {
    // per-class test-sample positions; kept non-reactive
    (this as unknown as InspectPanelNonReactive).classIndex = null;
  },
  mounted() {
    const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
    this.refresh();
    // Channel paging in the 3D layer panel: re-probe so the summaries cover
    // the newly selected channels (2D overlays and 3D read the same data).
    self.onVizParamsChanged = () => {
      if (this.inspectionShown && !this.busy) this.inspect(true);
    };
    this.$boardInterface.on('viz-params-changed', self.onVizParamsChanged);
  },
  beforeUnmount() {
    const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
    this.$boardInterface.off('viz-params-changed', self.onVizParamsChanged!);
  },
  activated() {
    // The panel lives under <keep-alive>; the dataset may have loaded (or
    // changed) while another tab was showing.
    this.refresh();
  },
  watch: {
    value() {
      this.refresh();
    },
  },
  methods: {
    dataset(): Dataset | TextDataset | undefined {
      return this.getDatasets()[this.value];
    },
    imageDataset(): Dataset | undefined {
      const dataset = this.dataset();
      return dataset instanceof TextDataset ? undefined : dataset;
    },
    textDataset(): TextDataset | undefined {
      const dataset = this.dataset();
      return dataset instanceof TextDataset ? dataset : undefined;
    },
    refresh() {
      const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
      const dataset = this.dataset();
      this.isTextDataset = dataset instanceof TextDataset;
      if (dataset instanceof TextDataset) {
        this.datasetReady = dataset.isLoaded();
        return;
      }
      this.datasetReady = !!(dataset && dataset.testLabels);
      if (!this.datasetReady) return;
      this.numClasses = dataset!.numClasses;
      self.classIndex = buildClassIndex(dataset!.testLabels, dataset!.numClasses);
      if (this.selectedClass >= this.numClasses) this.selectedClass = 0;
      this.classCount = self.classIndex[this.selectedClass]!.length;
      if (this.sampleNumber >= this.classCount) this.sampleNumber = 0;
      this.drawPreview();
    },
    selectClass(cls: number) {
      const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
      this.selectedClass = cls;
      this.sampleNumber = 0;
      this.classCount = self.classIndex ? self.classIndex[cls]!.length : 0;
      this.onSampleChanged();
    },
    step(direction: number) {
      if (this.classCount === 0) return;
      this.sampleNumber = (this.sampleNumber + direction + this.classCount) % this.classCount;
      this.onSampleChanged();
    },
    onSampleChanged() {
      this.drawPreview();
      // Live mode: while an inspection is shown, browsing samples re-runs it.
      if (this.inspectionShown && !this.busy) this.inspect(true);
    },
    currentSampleData(): Float32Array {
      const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
      const dataset = this.imageDataset();
      const index = self.classIndex![this.selectedClass]![this.sampleNumber]!;
      return sampleAt(dataset!.testImages, dataset!.imageByteSize, index);
    },
    drawPreview() {
      this.$nextTick(() => {
        const canvas = this.$refs.previewCanvas as HTMLCanvasElement | undefined;
        if (!canvas || !this.datasetReady || this.classCount === 0) return;
        drawSample(canvas, this.currentSampleData(), this.dataset()!.shape!);
      });
    },
    /** `auto` marks re-probes (sample browsing, viz paging): they never prompt. */
    async inspect(auto = false) {
      if (this.trainingState === 'running') {
        if (!auto && this.canPause) this.pausePrompt = { type: 'inspect' };
        return;
      }
      if (!this.hasTrainedModel || !this.datasetReady || this.classCount === 0 || this.busy) return;
      this.errorMessage = null;
      this.busy = true;
      try {
        const tf = await loadTf();
        const dataset = this.dataset()!;
        const { model, graphJson } = this.getTrainedModel()!;
        // tfjs values cross the probe seam untyped on purpose (engine.ts policy).
        const { probe, layerIds } = buildProbe(
          model as ProbeSourceModel, graphJson!, tf as unknown as ProbeTf,
        );
        const sampleData = this.currentSampleData();
        const input = tf.tensor(sampleData, [1, ...dataset.shape!]);
        // Conv summaries follow the 3D layer panel's channel paging.
        const vizParams = this.$boardInterface.getLayerVizParams();
        const channelOffsets: Record<string, number> = {};
        Object.entries(vizParams).forEach(([id, params]) => {
          if (params.channelOffset) channelOffsets[id] = params.channelOffset;
        });
        let byLayerId: Record<NnvpLayerId, InspectionEntry>;
        try {
          byLayerId = await runInspection(probe, layerIds, input, { channelOffsets });
        } finally {
          input.dispose();
        }
        // The Input node(s) show the sample itself — the probe only taps real layers.
        Object.assign(byLayerId, inputEntries(graphJson!, sampleData, dataset.shape!));
        this.$boardInterface.setInspection({
          byLayerId,
          sample: { class: this.selectedClass, number: this.sampleNumber, dataset: this.value },
        });
        this.inspectionShown = true;
      } catch (error) {
        console.error('[InspectPanel] Inspection failed:', error);
        const errorWithMessage = error as { message?: unknown } | null | undefined;
        this.errorMessage = String(
          errorWithMessage && errorWithMessage.message ? errorWithMessage.message : error,
        );
      } finally {
        this.busy = false;
      }
    },
    clearInspection() {
      this.$boardInterface.setInspection(null);
      this.inspectionShown = false;
    },
    stopGenerating() {
      this.generating = false;
    },
    cancelPausePrompt() {
      this.pausePrompt = null;
    },
    async confirmPausePrompt() {
      const pending = this.pausePrompt;
      this.pausePrompt = null;
      if (!pending) return;
      // false = nothing left to pause (the run finished in the meantime) —
      // the model is stable either way, so the pending action always runs.
      await this.pauseTraining('Inspect');
      if (pending.type === 'inspect') await this.inspect();
      else await this.generateChars(pending.count);
    },
    clearGenerated() {
      this.generatedText = '';
      this.clearInspection();
      this.errorMessage = null;
    },
    /**
     * Text mode's Inspect: generate `count` characters, one probe per
     * character — every step publishes the full per-layer inspection to the
     * board (the "watch the model light up" loop), then samples the next
     * character from the model's softmax at the current temperature.
     */
    async generateChars(count: number) {
      if (this.trainingState === 'running') {
        if (this.canPause) this.pausePrompt = { type: 'generate', count };
        return;
      }
      if (!this.hasTrainedModel || !this.datasetReady || this.generating || this.busy) return;
      this.errorMessage = null;
      this.generating = true;
      try {
        const tf = await loadTf();
        const dataset = this.textDataset()!;
        const { model, graphJson } = this.getTrainedModel()!;
        // Built once per run, shared by every character (weights, no copy).
        const { probe, layerIds } = buildProbe(
          model as ProbeSourceModel, graphJson!, tf as unknown as ProbeTf,
        );
        const vizParams = this.$boardInterface.getLayerVizParams();
        const channelOffsets: Record<string, number> = {};
        Object.entries(vizParams).forEach(([id, params]) => {
          if (params.channelOffset) channelOffsets[id] = params.channelOffset;
        });
        for (let i = 0; i < count && this.generating; i += 1) {
          const window = dataset.encodeContext(this.seedText + this.generatedText);
          const input = tf.tensor(window, [1, dataset.seqLen]);
          let byLayerId: Record<NnvpLayerId, InspectionEntry>;
          try {
            byLayerId = await runInspection(probe, layerIds, input, { channelOffsets });
          } finally {
            input.dispose();
          }
          Object.assign(byLayerId, inputEntries(graphJson!, window, dataset.shape));
          this.$boardInterface.setInspection({
            byLayerId,
            sample: {
              class: 0,
              number: this.generatedText.length,
              dataset: this.value,
            },
          });
          this.inspectionShown = true;
          // The probe's dense summaries cap at 64 units — below the vocab
          // size — so the sampling distribution comes from a direct predict.
          const predictInput = tf.tensor(window, [1, dataset.seqLen]);
          let probs: Float32Array;
          try {
            const scores = (model as { predict(x: unknown): unknown }).predict(
              predictInput,
            ) as { data(): Promise<Float32Array>; dispose(): void };
            try {
              probs = await scores.data();
            } finally {
              scores.dispose();
            }
          } finally {
            predictInput.dispose();
          }
          this.generatedText += indexToChar(sampleFromProbs(probs, this.temperature));
          // Yield a frame so the board repaints between characters.
          await new Promise(resolve => setTimeout(resolve, 30)); // eslint-disable-line no-await-in-loop
        }
      } catch (error) {
        console.error('[InspectPanel] Generation failed:', error);
        const errorWithMessage = error as { message?: unknown } | null | undefined;
        this.errorMessage = String(
          errorWithMessage && errorWithMessage.message ? errorWithMessage.message : error,
        );
      } finally {
        this.generating = false;
      }
    },
  },
});
</script>

<style>
#InspectPanel {
  height: 100%;
  width: 100%;
  cursor: default;
  font-family: var(--font-regular); font-weight: var(--font-weight-regular);
  font-size: 15px;
  overflow: auto;
}
.inspect-hint {
  margin: 20px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.4;
}
.inspect-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 15px;
}
.inspect-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.inspect-sample-position {
  min-width: 70px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}
.inspect-nav-button {
  padding: 2px 10px;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 15px;
  cursor: pointer;
}
.inspect-nav-button:hover {
  background-color: var(--bg-hover);
}
.inspect-preview {
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  image-rendering: pixelated;
}
.inspect-button {
  padding: 6px 18px;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
}
.inspect-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.inspect-button.inspect-run:not(:disabled) {
  background-color: var(--fill-strong);
  border-color: var(--fill-strong);
  color: var(--fill-strong-text);
}
.inspect-error {
  margin: 0 15px;
  color: var(--edge-error, #c0392b);
  font-size: 13px;
  text-align: center;
}
.inspect-seed {
  flex: 1;
  min-width: 200px;
  border: 1px solid var(--input-border);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-family: var(--font-regular);
  font-size: 13px;
  resize: vertical;
}
.inspect-generated {
  align-self: stretch;
  margin: 0 15px;
  padding: 10px;
  min-height: 80px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}
.inspect-generated-seed {
  color: var(--text-muted);
}
.inspect-resume-row {
  justify-content: center;
  padding: 10px 15px 0 15px;
}
.inspect-paused-note {
  font-size: 13px;
  color: var(--text-muted);
}
.inspect-pause-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.inspect-pause-modal {
  background-color: var(--bg-panel);
  border: var(--border-width) solid var(--panel-border);
  border-radius: 15px;
  padding: 30px;
  max-width: 400px;
  box-shadow: var(--panel-shadow);
}
.inspect-pause-message {
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.5;
  margin-bottom: 20px;
  text-align: center;
}
.inspect-pause-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}
</style>
