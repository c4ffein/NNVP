<template>
  <div class="TimelinePanel">
    <p v-if="loaded && !steps.length" class="timeline-empty">
      No model history yet — run a training and its architecture appears here.
    </p>
    <p v-else-if="loaded && !visibleSteps.length" class="timeline-empty">
      No architectures in this date range.
    </p>
    <!-- A quiet grid (no visible grid chrome): timestamp column first, then
         the architecture line — the "huge blocks" become skimmable rows. -->
    <ol v-else-if="visibleSteps.length" class="timeline-steps">
      <li v-for="step in visibleSteps" :key="step.workHash" class="timeline-step">
        <span class="timeline-when">{{ whenOf(step) }}</span>
        <div class="timeline-body">
          <p class="timeline-step-title">
            {{ step.summary || 'unnamed model' }}
            <span class="timeline-step-meta">
              · {{ step.runCount }} run{{ step.runCount === 1 ? '' : 's' }}<template
                v-if="step.checkpointCount > 0"> · {{ step.checkpointCount }} checkpoint{{
                  step.checkpointCount === 1 ? '' : 's' }}</template><template
                v-if="step.docVariants > 1"> · {{ step.docVariants }} naming variants</template><template
              v-if="scores && scores[step.workHash]"> · <span class="timeline-score">★ {{
                scores[step.workHash]!.score }} (#{{ scores[step.workHash]!.rank }}/{{
                scores[step.workHash]!.total }})</span></template>
            </span>
          </p>
          <ul v-if="step.diffFromPrevious && step.diffFromPrevious.length" class="timeline-diff">
            <li v-for="line in step.diffFromPrevious" :key="line">{{ line }}</li>
          </ul>
        </div>
      </li>
    </ol>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { buildModelTimeline } from '../../lib/Training/modelTimeline';
import type { TimelineSnapshot, TimelineStep } from '../../lib/Training/modelTimeline';
import { formatWhen, inRange, pickSeen } from '../../lib/Training/modelsView';
import type { SeenMode, SeenRange, WhenMode } from '../../lib/Training/modelsView';
import type { FoldedRun } from '../../lib/Training/runEvents';

/**
 * The Models window's timeline list (Phase F3, regridded in the G follow-up):
 * the journal's architectures oldest first, one grid row each — timestamp
 * column (absolute or human, first or last iteration, per the window's
 * shared settings), then the summary and its diff from the previous step.
 * Same prop-injection pattern as HistoryPanel; the pure decisions live in
 * modelTimeline/modelsView.
 */
export default defineComponent({
  name: 'TimelinePanel',
  props: {
    listRuns: {
      type: Function as PropType<(options?: { includeHidden?: boolean }) => Promise<FoldedRun[]>>,
      default: null,
    },
    /** Checkpoint snapshots joining the story (Phase G2; ModelsWindow wires it). */
    listSnapshots: {
      type: Function as PropType<() => Promise<TimelineSnapshot[]>>,
      default: null,
    },
    // The window's shared filter bar (defaults = standalone mounts unfiltered).
    whenMode: { type: String as PropType<WhenMode>, default: 'absolute' },
    seenMode: { type: String as PropType<SeenMode>, default: 'first' },
    range: {
      type: Object as PropType<SeenRange>,
      default: (): SeenRange => ({ from: null, to: null }),
    },
    order: { type: String as PropType<'newest' | 'oldest'>, default: 'newest' },
    /** Pairwise ratings per workHash (ModelsWindow wires it); null = none. */
    scores: {
      type: Object as PropType<Record<string, { score: number; rank: number; total: number }>>,
      default: null,
    },
  },
  inheritAttrs: false,
  data() {
    return {
      steps: [] as TimelineStep[],
      loaded: false,
    };
  },
  computed: {
    visibleSteps(): TimelineStep[] {
      const filtered = this.steps.filter(step => inRange(
        pickSeen(step.firstSeen, step.lastSeen, this.seenMode), this.range,
      ));
      return this.order === 'newest' ? filtered.reverse() : filtered;
    },
  },
  mounted() {
    this.refresh();
  },
  activated() {
    this.refresh();
  },
  methods: {
    async refresh(): Promise<void> {
      if (!this.listRuns) { this.loaded = true; return; }
      // Hidden runs still shaped the model's history — include them.
      const [runs, snapshots] = await Promise.all([
        this.listRuns({ includeHidden: true }),
        this.listSnapshots ? this.listSnapshots() : Promise.resolve([]),
      ]);
      this.steps = await buildModelTimeline(runs, snapshots);
      this.loaded = true;
    },
    whenOf(step: TimelineStep): string {
      return formatWhen(
        pickSeen(step.firstSeen, step.lastSeen, this.seenMode), this.whenMode, Date.now(),
      );
    },
  },
});
</script>

<style>
.TimelinePanel {
  padding: 14px 18px;
  font-size: 13px;
  color: var(--text-primary);
  text-align: left;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.timeline-empty { margin: 0; color: var(--text-muted); max-width: 640px; }
.timeline-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 16px;
  row-gap: 6px;
  align-items: baseline;
}
/* Each step contributes its cells directly to the shared grid. */
.timeline-step { display: contents; }
.timeline-when {
  grid-column: 1;
  white-space: nowrap;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.timeline-body { grid-column: 2; min-width: 0; }
.timeline-step-title { margin: 0; font-weight: var(--font-weight-semibold); }
.timeline-step-meta { color: var(--text-muted); font-weight: var(--font-weight-regular); }
.timeline-score { color: var(--accent); }
.timeline-diff {
  margin: 2px 0 0;
  padding-left: 18px;
  color: var(--text-muted);
}
</style>
