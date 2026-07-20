<template>
  <div id="InspectPanel" class="InspectPanel">
    <div v-if="!hasTrainedModel" class="inspect-hint" data-testid="inspect-no-model-hint">
      Train a model first — Inspect runs a dataset sample through your trained
      network and shows each layer's activations on the board.
    </div>
    <div v-else-if="!datasetReady" class="inspect-hint" data-testid="inspect-no-dataset-hint">
      Load a dataset in the Dataset tab first.
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
          v-on:click="inspect"
        >{{ busy ? 'Inspecting…' : 'Inspect' }}</button>
        <button
          class="inspect-button"
          v-bind:disabled="!inspectionShown"
          v-on:click="clearInspection"
        >Clear</button>
      </div>
      <div v-if="errorMessage" class="inspect-error" role="alert">{{ errorMessage }}</div>
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
import type Dataset from '../../lib/JSDatasets/google-data-loader';
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
      type: Function as PropType<() => Record<string, Dataset>>,
      default: () => ({}),
    },
    hasTrainedModel: { type: Boolean, default: false },
    getTrainedModel: {
      type: Function as PropType<() => TrainedModelRef | null>,
      default: () => null,
    },
  },
  data() {
    return {
      datasetReady: false,
      numClasses: 0,
      classCount: 0,
      selectedClass: 0,
      sampleNumber: 0,
      inspectionShown: false,
      busy: false,
      errorMessage: null as string | null,
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
      if (this.inspectionShown && !this.busy) this.inspect();
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
    dataset(): Dataset | undefined {
      return this.getDatasets()[this.value];
    },
    refresh() {
      const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
      const dataset = this.dataset();
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
      if (this.inspectionShown && !this.busy) this.inspect();
    },
    currentSampleData(): Float32Array {
      const self = this as unknown as InspectPanelNonReactive; // non-reactive by design
      const dataset = this.dataset();
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
    async inspect() {
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
</style>
