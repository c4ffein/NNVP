<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-overlay inspection-guard-overlay" @click="keepChange">
      <div
        class="modal-surface inspection-guard"
        role="dialog"
        aria-modal="true"
        aria-label="Trained model modified"
        @click.stop
      >
        <h2>This network has a trained model</h2>
        <p>
          The Inspect colors and weights you can visualize match the board
          <em>as it was trained</em>. Your change just altered the computation,
          so those visualizations no longer apply — they have been cleared,
          and you'll need to retrain to inspect again.
        </p>
        <div class="inspection-guard-buttons">
          <button type="button" class="inspection-guard-keep" @click="keepChange">Keep my change</button>
          <button type="button" class="inspection-guard-undo" @click="undoChange">Undo the change</button>
        </div>
        <label class="inspection-guard-dismiss">
          <input type="checkbox" v-model="dontShowAgain">
          Don't warn me again (edits will still clear the visualizations)
        </label>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

const HIDE_KEY = 'nnvp-hide-retrain-warning';

function hideRequested(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

// Non-reactive instance state (the TutorialMenu pattern).
interface GuardInternal {
  onInvalidated: (data?: unknown) => void;
  droppedSnapshot: unknown;
}

/**
 * Post-hoc guard for the trained-model / board correspondence: the facade
 * has ALREADY cleared the invalidated inspection when this shows (the
 * clearing never depends on the dialog — see BoardInterface.
 * checkInspectionInvalidation). The dialog only offers the choice: keep the
 * edit, or undo it — in which case the workHash matches again and the
 * dropped snapshot is honestly restorable.
 */
export default defineComponent({
  name: 'InspectionGuardModal',
  data() {
    return {
      visible: false,
      dontShowAgain: false,
    };
  },
  watch: {
    dontShowAgain(hide: boolean) {
      try {
        if (hide) localStorage.setItem(HIDE_KEY, '1');
        else localStorage.removeItem(HIDE_KEY);
      } catch { /* privacy mode */ }
    },
  },
  mounted() {
    const self = this as typeof this & GuardInternal;
    self.droppedSnapshot = null;
    self.onInvalidated = (data?: unknown) => {
      if (hideRequested()) return; // still cleared by the facade — only the dialog is muted
      self.droppedSnapshot = (data as { snapshot?: unknown } | undefined)?.snapshot ?? null;
      this.visible = true;
    };
    this.$boardInterface.on('inspection-invalidated', self.onInvalidated);
  },
  beforeUnmount() {
    const self = this as typeof this & GuardInternal;
    this.$boardInterface.off('inspection-invalidated', self.onInvalidated);
  },
  methods: {
    keepChange() {
      this.visible = false;
    },
    undoChange() {
      const self = this as typeof this & GuardInternal;
      this.$boardInterface.undo();
      // The graph is back to the state the model was trained on — the
      // dropped colors are honest again.
      if (self.droppedSnapshot !== null) {
        this.$boardInterface.setInspection(self.droppedSnapshot);
      }
      this.visible = false;
    },
  },
});
</script>

<style scoped>
.inspection-guard-overlay {
  z-index: 2200; /* above every panel and the tutorial overlay */
}

.inspection-guard {
  max-width: 440px;
  padding: 26px 28px;
  text-align: left;
  font-family: var(--font-regular);
  color: var(--text-primary);
}

.inspection-guard h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.25em;
  margin: 0 0 10px 0;
}

.inspection-guard p {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-muted);
  margin: 0 0 16px 0;
}

.inspection-guard-buttons {
  display: flex;
  gap: 10px;
}

.inspection-guard-keep,
.inspection-guard-undo {
  flex: 1;
  padding: 9px 14px;
  border-radius: 10px;
  font-family: var(--font-regular);
  font-size: 14px;
  cursor: pointer;
}

.inspection-guard-keep {
  background: var(--accent);
  border: none;
  color: var(--accent-text);
  font-weight: var(--font-weight-semibold);
}

.inspection-guard-undo {
  background: var(--bg-input);
  border: 1px solid var(--input-border);
  color: var(--text-primary);
}

.inspection-guard-dismiss {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  font-size: 12.5px;
  color: var(--text-muted);
  cursor: pointer;
}
</style>
