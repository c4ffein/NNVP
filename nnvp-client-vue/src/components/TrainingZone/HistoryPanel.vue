<template>
  <div class="HistoryPanel">
    <p v-if="loaded && !runs.length" class="history-empty">
      No training runs recorded yet — every Train click journals one here.
    </p>
    <table v-else-if="runs.length" class="history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Dataset</th>
          <th>Engine</th>
          <th>Outcome</th>
          <th>Epochs</th>
          <th>Final acc</th>
          <th>Final loss</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="run in runs" :key="run.uuid">
          <tr class="history-row">
            <td>{{ formatDate(run.startedAt) }}</td>
            <td>{{ run.config.dataset }}</td>
            <td>{{ run.engineId }}</td>
            <td
              class="history-outcome"
              :class="{ 'history-outcome-error': run.outcome === 'error' }"
              :title="run.error || ''"
            >{{ run.outcome }}</td>
            <td>{{ run.epochMetrics.length }} / {{ run.config.epochs }}</td>
            <td>{{ formatMetric(finalMetrics(run)?.acc, 2) }}</td>
            <td>{{ formatMetric(finalMetrics(run)?.loss, 3) }}</td>
            <td class="history-actions">
              <template v-if="confirmingUuid === run.uuid">
                <span class="history-confirm-label">Delete this run?</span>
                <button
                  v-for="choice in deleteOptions"
                  :key="choice"
                  type="button"
                  class="history-confirm-delete"
                  :class="'history-delete-' + choice"
                  @click="confirmDelete(run, choice)"
                >{{ choiceLabel(choice) }}</button>
                <button type="button" class="history-cancel-delete" @click="cancelDelete">
                  Cancel
                </button>
              </template>
              <template v-else>
                <button type="button" class="history-view" @click="toggleView(run)">
                  {{ expandedUuid === run.uuid ? 'Hide' : 'View' }}
                </button>
                <button type="button" class="history-restore" @click="restore(run)">Restore</button>
                <button type="button" class="history-delete" @click="askDelete(run)">Delete</button>
              </template>
            </td>
          </tr>
          <tr v-if="expandedUuid === run.uuid" class="history-curves-row">
            <td colspan="8">
              <div v-if="run.epochMetrics.length" class="history-curves">
                <LineChart title="Epoch Results" :chartData="epochChartData(run)" />
              </div>
              <p v-else class="history-empty">No epoch metrics were recorded for this run.</p>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import LineChart from './LineChart.vue';
import type { EpochMetrics, RunRecord } from '../../lib/Training/runJournal';

/**
 * Where a delete may act (PLAN.md Phase 6). Declared locally on purpose:
 * this panel is prop-injection pure and never imports sync.ts/apiClient —
 * the union mirrors sync's DeleteWhere structurally.
 */
type DeleteWhere = 'local' | 'cloud' | 'both';

/** Button labels per delete location ('local' reads better as "device"). */
const DELETE_LABELS: Record<DeleteWhere, string> = {
  local: 'device', cloud: 'cloud', both: 'both',
};

/** One chart line, in the exact shape LineChart consumes (gaps allowed). */
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
 * The run-history tab: a newest-first table of journaled training runs.
 * All data access comes in AS PROPS through TrainingZone's dynamic
 * <component> prop set (the BenchPanel pattern) — this component never
 * touches the journal module itself, so it mounts standalone under tests.
 */
export default defineComponent({
  name: 'HistoryPanel',
  components: { LineChart },
  // From TrainingZone's dynamic <component> prop set; defaults are null like
  // BenchPanel's loadDataset/getDatasets, so unrelated panels' props can flow
  // past without warnings.
  props: {
    listRuns: { type: Function as PropType<() => Promise<RunRecord[]>>, default: null },
    deleteRun: {
      type: Function as PropType<(uuid: string, where: DeleteWhere) => Promise<void>>,
      default: null,
    },
    // Which locations hold a record (so which delete buttons to offer);
    // null (standalone mounts, older parents) degrades to local-only.
    deleteChoices: {
      type: Function as PropType<(run: RunRecord) => Promise<DeleteWhere[]>>,
      default: null,
    },
    restoreRun: { type: Function as PropType<(run: RunRecord) => void>, default: null },
  },
  inheritAttrs: false,
  data() {
    return {
      runs: [] as RunRecord[],
      loaded: false,
      /** The run whose curves are expanded below its row. */
      expandedUuid: null as string | null,
      /** The run whose Delete awaits its inline confirmation. */
      confirmingUuid: null as string | null,
      /** The delete locations offered for confirmingUuid; [] while loading. */
      deleteOptions: [] as DeleteWhere[],
    };
  },
  mounted() {
    this.refresh();
  },
  // TrainingZone keeps its panels under <keep-alive>: re-list on every return
  // to the tab so runs journaled meanwhile appear. (refresh is idempotent, so
  // the mounted+activated double-fire on the very first open is harmless.)
  activated() {
    this.refresh();
  },
  methods: {
    async refresh(): Promise<void> {
      if (!this.listRuns) { this.loaded = true; return; }
      const runs = await this.listRuns();
      // The journal already lists newest-first; re-sort defensively so the
      // table's contract never depends on the data source's ordering.
      this.runs = [...runs].sort(
        (a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0),
      );
      this.loaded = true;
    },
    formatDate(iso: string): string {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
    },
    formatMetric(value: number | undefined, digits: number): string {
      return Number.isFinite(value) ? value!.toFixed(digits) : '—';
    },
    /** The last journaled epoch entry — the "final" acc/loss cells. */
    finalMetrics(run: RunRecord): EpochMetrics | undefined {
      return run.epochMetrics[run.epochMetrics.length - 1];
    },
    /**
     * The record's epoch metrics in Charts' epoch-chart shape: same series
     * names as the live chart, so LineChart's line-acc/line-val-* colors apply.
     */
    epochChartData(run: RunRecord): ChartData {
      const metrics = run.epochMetrics;
      const series: ChartSeries[] = [
        { className: 'ct-series-acc', name: 'acc', data: metrics.map(m => m.acc) },
        { className: 'ct-series-val-acc', name: 'val-acc', data: metrics.map(m => m.valAcc) },
        { className: 'ct-series-loss', name: 'loss', data: metrics.map(m => m.loss) },
        { className: 'ct-series-val-loss', name: 'val-loss', data: metrics.map(m => m.valLoss) },
      ].filter(s => s.data.some(v => Number.isFinite(v)));
      return { labels: metrics.map(m => m.epoch), series };
    },
    toggleView(run: RunRecord): void {
      this.expandedUuid = this.expandedUuid === run.uuid ? null : run.uuid;
    },
    restore(run: RunRecord): void {
      if (this.restoreRun) this.restoreRun(run);
    },
    choiceLabel(choice: DeleteWhere): string {
      return DELETE_LABELS[choice];
    },
    async askDelete(run: RunRecord): Promise<void> {
      this.confirmingUuid = run.uuid;
      this.deleteOptions = [];
      if (!this.deleteChoices) { this.deleteOptions = ['local']; return; }
      const choices = await this.deleteChoices(run);
      // Stale guard: only apply if this run's confirmation is still open
      // (the user may have cancelled, or asked about another row, meanwhile).
      if (this.confirmingUuid === run.uuid) this.deleteOptions = choices;
    },
    cancelDelete(): void {
      this.confirmingUuid = null;
      this.deleteOptions = [];
    },
    async confirmDelete(run: RunRecord, where: DeleteWhere): Promise<void> {
      if (!this.deleteRun) return;
      await this.deleteRun(run.uuid, where);
      // A cloud-only delete leaves the local record (now detached from its
      // cloud copy): the row stays. Otherwise drop the row locally instead
      // of re-listing — the delete just resolved, and a re-list would race
      // any slower backing store.
      if (where !== 'cloud') {
        this.runs = this.runs.filter(r => r.uuid !== run.uuid);
        if (this.expandedUuid === run.uuid) this.expandedUuid = null;
      }
      this.confirmingUuid = null;
      this.deleteOptions = [];
    },
  },
});
</script>

<style>
.HistoryPanel {
  padding: 14px 18px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
}
.history-empty { margin: 0; color: var(--text-muted); max-width: 640px; }
.history-table { border-collapse: collapse; width: 100%; }
.history-table th, .history-table td {
  border: 1px solid var(--panel-border);
  padding: 4px 12px;
  text-align: left;
}
.history-table thead th { font-weight: var(--font-weight-semibold); }
.history-outcome-error { color: #b91c1c; }
.history-actions { white-space: nowrap; }
.history-actions button { cursor: pointer; margin-right: 6px; }
.history-actions button:last-child { margin-right: 0; }
.history-confirm-label { color: #b45309; margin-right: 8px; }
.history-confirm-delete { color: #b91c1c; }
.history-curves-row td { padding: 10px 12px; }
.history-curves { height: 280px; max-width: 900px; }
</style>
