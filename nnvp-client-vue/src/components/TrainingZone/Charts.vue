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

export default {
  name: 'Charts',
  components: {
    LineChart
  },
  data() {
    return {
      batchData: { labels: [], series: [] },
      epochData: { labels: [], series: [] }
    };
  },
  mounted() {
    try {
      // Find the TrainingZone parent (might be behind KeepAlive wrapper)
      let parent = this.$parent;
      while (parent && parent.$options.name !== 'TrainingZone') {
        parent = parent.$parent;
      }

      if (!parent) {
        console.error('[Charts] Could not find TrainingZone parent');
        return;
      }

      // Create chart update interface for TrainingZone
      parent.batchChart = {
        update: () => {
          this.batchData = { ...parent.chartData0 };
          const debugEnabled = window.nnvp?.debug?.enableTraining;
          if (debugEnabled) {
            console.log('[Charts] Batch chart update:', JSON.stringify(this.batchData));
          }
        }
      };

      parent.epochChart = {
        update: () => {
          this.epochData = { ...parent.chartData1 };
          const debugEnabled = window.nnvp?.debug?.enableTraining;
          if (debugEnabled) {
            console.log('[Charts] Epoch chart update:', JSON.stringify(this.epochData));
          }
        }
      };

      console.log('[Charts] mounted successfully with custom LineChart');
    } catch (error) {
      console.error('[Charts] Error in mounted():', error);
      throw error;
    }
  }
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
