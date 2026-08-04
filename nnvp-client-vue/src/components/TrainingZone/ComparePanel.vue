<template>
  <div class="ComparePanel">
    <p v-if="!compareSelection || compareSelection.length < 2" class="compare-empty">
      Select two or more runs in the History tab and press Compare.
    </p>
    <template v-else>
      <p class="compare-verdict">{{ verdictText }}</p>
      <div class="compare-controls">
        <select class="compare-metric" v-model="metric">
          <option value="valAcc">val-acc</option>
          <option value="acc">acc</option>
          <option value="loss">loss</option>
          <option value="valLoss">val-loss</option>
        </select>
      </div>
      <div class="compare-chart">
        <LineChart title="Epoch overlay" :chartData="chart" />
      </div>
      <table v-if="diffRows.length" class="compare-config">
        <thead>
          <tr>
            <th></th>
            <th v-for="(run, index) in compareSelection" :key="run.uuid">#{{ index + 1 }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in diffRows" :key="row.key">
            <td class="compare-config-key">{{ row.key }}</td>
            <td v-for="(value, index) in row.values" :key="index">{{ value }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="compare-config-same">Identical training configs.</p>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import LineChart from './LineChart.vue';
import { compareVerdict, configDiffRows, overlayChartData } from '../../lib/Training/compareView';
import type { ChartData, CompareMetric, CompareVerdict, ConfigDiffRow } from '../../lib/Training/compareView';
import { modelIdentityOf } from '../../lib/Training/modelIdentity';
import type { FoldedRun } from '../../lib/Training/runEvents';

const VERDICT_TEXT: Record<CompareVerdict, string> = {
  identical: 'Identical models.',
  'same-network': 'Same network — naming/comments differ.',
  'different-network': 'Different networks.',
  unknown: 'Model identity unknown for at least one run.',
};

/**
 * The Compare tab (Phase F): the runs picked in History, overlaid on one
 * epoch axis, with the differ-only config table and the two-tier identity
 * verdict. Selection arrives AS A PROP from TrainingZone (which owns the
 * cross-panel state); everything decided here is a pure compareView call —
 * this component stays mountable standalone under bun.
 */
export default defineComponent({
  name: 'ComparePanel',
  components: { LineChart },
  props: {
    compareSelection: { type: Array as PropType<FoldedRun[]>, default: null },
  },
  inheritAttrs: false,
  data() {
    return {
      metric: 'valAcc' as CompareMetric,
      /** null while the async identity hashes are still computing. */
      verdict: null as CompareVerdict | null,
    };
  },
  computed: {
    runs(): FoldedRun[] {
      return this.compareSelection ?? [];
    },
    chart(): ChartData {
      return overlayChartData(this.runs, this.metric);
    },
    diffRows(): ConfigDiffRow[] {
      return configDiffRows(this.runs.map(run => run.config));
    },
    verdictText(): string {
      return this.verdict === null ? 'Comparing…' : VERDICT_TEXT[this.verdict];
    },
  },
  watch: {
    compareSelection: {
      immediate: true,
      async handler(selection: FoldedRun[] | null) {
        this.verdict = null;
        if (!selection || selection.length < 2) return;
        const identities = await Promise.all(
          selection.map(run => (run.graphJson === null
            ? Promise.resolve(null) : modelIdentityOf(run.graphJson))),
        );
        // Stale guard: only publish if the selection didn't change meanwhile.
        if (this.compareSelection === selection) this.verdict = compareVerdict(identities);
      },
    },
  },
});
</script>

<style>
.ComparePanel {
  padding: 14px 18px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.compare-empty { margin: 0; color: var(--text-muted); max-width: 640px; }
.compare-verdict { margin: 0 0 8px; font-weight: var(--font-weight-semibold); }
.compare-controls { margin-bottom: 8px; }
.compare-metric {
  font: inherit;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 2px 4px;
}
.compare-chart { height: 280px; max-width: 900px; }
.compare-config { border-collapse: collapse; margin-top: 12px; }
.compare-config th, .compare-config td {
  border: 1px solid var(--panel-border);
  padding: 4px 12px;
  text-align: left;
}
.compare-config-key { color: var(--text-muted); }
.compare-config-same { color: var(--text-muted); }
</style>
