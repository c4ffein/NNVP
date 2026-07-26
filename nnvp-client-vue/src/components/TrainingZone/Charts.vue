<template>
  <div id="Charts" class="Charts">
    <!-- Pause/resume strip: only for engines that can pause; the Resume
         button renders on the tab that initiated the pause (pausedBy). -->
    <div
      v-if="canPause && (trainingState === 'running' || trainingState === 'paused')"
      class="charts-training-controls"
      data-testid="charts-training-controls"
    >
      <button
        v-if="trainingState === 'running'"
        class="charts-pause-button"
        data-testid="charts-pause-button"
        v-on:click="pauseTraining('Charts')"
      >⏸ Pause</button>
      <button
        v-else-if="pausedBy === 'Charts'"
        class="charts-pause-button charts-resume"
        data-testid="charts-resume-button"
        v-on:click="resumeTraining()"
      >▶ Resume</button>
      <span v-else class="charts-paused-elsewhere" data-testid="charts-paused-elsewhere">
        Training paused — resume from the {{ pausedBy }} tab.
      </span>
      <span v-if="phaseProgress" class="charts-phase-progress" data-testid="charts-phase-progress">
        <template v-if="phaseProgress.phaseCount > 1">
          Phase {{ phaseProgress.phaseIndex + 1 }}/{{ phaseProgress.phaseCount }}
          ({{ phaseProgress.label }}) —
        </template>
        epoch {{ phaseProgress.epochsDone }}/{{ phaseProgress.epochsTotal }}
      </span>
    </div>
    <LineChart
      title="Batch Results"
      :chartData="batchData"
      class="chart-instance"
      has-help
      @show-help="helpTopic = 'batch'"
    />
    <LineChart
      title="Epoch Results"
      :chartData="epochData"
      :markers="phaseBoundaries"
      class="chart-instance"
      has-help
      @show-help="helpTopic = 'epoch'"
    />

    <!-- Curriculum boundary samples: same seed, before vs after fine-tuning -->
    <div v-if="phaseSamples.length > 0" class="phase-samples" data-testid="phase-samples">
      <div v-bind:key="sample.label" v-for="sample in phaseSamples" class="phase-sample">
        <div class="phase-sample-label">{{ sample.label }}</div>
        <pre class="phase-sample-text">{{ sample.text }}</pre>
      </div>
    </div>

    <!-- Same help-modal chrome as the layer (?) buttons -->
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="helpTopic" class="layer-help-modal-overlay" @click="helpTopic = null">
        <div
          class="layer-help-modal-container"
          role="dialog"
          aria-modal="true"
          :aria-label="(helpTopic === 'batch' ? 'Batch' : 'Epoch') + ' results help'"
          @click.stop
        >
          <button class="layer-help-modal-close" aria-label="Close" @click="helpTopic = null">&times;</button>
          <div class="layer-help-modal-body">
            <div v-if="helpTopic === 'batch'">
              <h2>Batch Results</h2>
              <p>One point is added <strong>after every batch</strong> — each small group of
              examples the optimizer processes while working through an epoch. It is the
              most fine-grained, live view of training.</p>
              <ul>
                <li><strong>acc</strong> — accuracy on the training batches: the fraction of
                examples the model currently classifies correctly.</li>
                <li><strong>loss</strong> — the error value the optimizer is minimizing
                (lower is better).</li>
              </ul>
              <p>Only <i>training</i> metrics appear here: validation runs once per epoch,
              so <i>val</i> curves live in the Epoch Results chart. A jagged line is
              normal — every batch is a different random slice of the data.</p>
            </div>
            <div v-else>
              <h2>Epoch Results</h2>
              <p>One point is added <strong>after every epoch</strong> — a full pass over the
              whole training set. After each pass the model is also evaluated on
              <strong>validation data it never trained on</strong>, which is what the
              <i>val</i> curves show.</p>
              <ul>
                <li><strong>acc / loss</strong> — accuracy and error on the training data.</li>
                <li><strong>val-acc / val-loss</strong> — the same, measured on the held-out
                validation data: the honest estimate of how the model will do on new data.</li>
              </ul>
              <p>💡 If <strong>acc</strong> keeps climbing while <strong>val-acc</strong> stalls
              or drops (or val-loss rises), the model is <i>overfitting</i> — memorizing the
              training data instead of learning to generalize. Fewer epochs, more data, or
              regularization layers (e.g. Dropout) help.</p>
            </div>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import LineChart from './LineChart.vue';

/** One chart line as watchTraining reassigns it (gaps for missing metrics). */
interface ChartSeries {
  className: string;
  name: string;
  data: (number | undefined)[];
}

/** The reactive chart-data objects owned by TrainingZone. */
interface ChartData {
  labels: number[];
  series: ChartSeries[];
}

/** Instance state kept OFF data() — non-reactive by design. */
interface ChartsNonReactive {
  handleEscape?: (event: KeyboardEvent) => void;
}

// Purely presentational: TrainingZone owns the chart data (updated by
// watchTraining during a fit) and passes it down; reactivity handles the rest.
export default defineComponent({
  name: 'Charts',
  components: {
    LineChart
  },
  props: {
    batchData: { type: Object as PropType<ChartData>, default: () => ({ labels: [], series: [] }) },
    epochData: { type: Object as PropType<ChartData>, default: () => ({ labels: [], series: [] }) },
    // Pause/resume strip (TrainingZone's run controller surface).
    trainingState: { type: String, default: 'idle' },
    pausedBy: { type: String as PropType<string | null>, default: null },
    canPause: { type: Boolean, default: false },
    pauseTraining: {
      type: Function as PropType<(by: string) => Promise<boolean>>,
      default: () => Promise.resolve(false),
    },
    resumeTraining: { type: Function as PropType<() => void>, default: () => {} },
    // Curriculum surface: epoch chart markers + phase-boundary text samples.
    phaseBoundaries: { type: Array as PropType<number[]>, default: () => [] },
    phaseSamples: {
      type: Array as PropType<{ label: string; text: string }[]>,
      default: () => [],
    },
    phaseProgress: {
      type: Object as PropType<{
        phaseIndex: number; phaseCount: number; label: string;
        epochsDone: number; epochsTotal: number;
      } | null>,
      default: null,
    },
  },
  data() {
    return { helpTopic: null as 'batch' | 'epoch' | null };
  },
  mounted() {
    const self = this as unknown as ChartsNonReactive; // non-reactive by design
    self.handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.helpTopic) this.helpTopic = null;
    };
    document.addEventListener('keydown', self.handleEscape);
  },
  beforeUnmount() {
    const self = this as unknown as ChartsNonReactive; // non-reactive by design
    document.removeEventListener('keydown', self.handleEscape!);
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

#Charts {
  height: 100%;
  width: 100%;
  display: grid;
  padding: 1%;
  grid-template-columns: 50% 50%;
  gap: 20px;
}

.charts-training-controls {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 30px;
}
.charts-pause-button {
  padding: 4px 14px;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}
.charts-pause-button:hover {
  background-color: var(--bg-hover);
}
.charts-pause-button.charts-resume {
  background-color: var(--fill-strong);
  border-color: var(--fill-strong);
  color: var(--fill-strong-text);
}
.charts-paused-elsewhere {
  font-size: 13px;
  color: var(--text-muted);
}
.charts-phase-progress {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
}

.phase-samples {
  grid-column: 1 / -1;
  display: flex;
  gap: 15px;
  align-items: stretch;
}
.phase-sample {
  flex: 1;
  min-width: 0;
}
.phase-sample-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.phase-sample-text {
  margin: 0;
  padding: 8px;
  max-height: 140px;
  overflow: auto;
  white-space: pre-wrap;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-primary);
}

.chart-instance {
  width: 100%;
  height: 100%;
}
</style>
