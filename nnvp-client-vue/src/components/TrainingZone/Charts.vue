<template>
  <div id="Charts" class="Charts">
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
      class="chart-instance"
      has-help
      @show-help="helpTopic = 'epoch'"
    />

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

<script>
import LineChart from './LineChart.vue';

// Purely presentational: TrainingZone owns the chart data (updated by
// watchTraining during a fit) and passes it down; reactivity handles the rest.
export default {
  name: 'Charts',
  components: {
    LineChart
  },
  props: {
    batchData: { type: Object, default: () => ({ labels: [], series: [] }) },
    epochData: { type: Object, default: () => ({ labels: [], series: [] }) },
  },
  data() {
    return { helpTopic: null };
  },
  mounted() {
    this.handleEscape = (event) => {
      if (event.key === 'Escape' && this.helpTopic) this.helpTopic = null;
    };
    document.addEventListener('keydown', this.handleEscape);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },
};
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

.chart-instance {
  width: 100%;
  height: 100%;
}
</style>
