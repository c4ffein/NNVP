<template>
  <div id="Charts" class="Charts">
    <LineChart
      title="Batch Results"
      :chartData="batchData"
      class="chart-instance"
    />
    <LineChart
      title="Epoch Results"
      :chartData="epochData"
      class="chart-instance"
    />
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
