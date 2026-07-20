<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="$emit('close')">
      <div
        class="modal-surface tutorial-menu-container"
        role="dialog"
        aria-modal="true"
        aria-label="Tutorials"
        @click.stop
      >
        <button class="modal-close" @click="$emit('close')" aria-label="Close">&times;</button>
        <div class="tutorial-menu-content">
          <h1>Tutorials</h1>
          <p class="subtitle">Guided, hands-on tours of the editor</p>
          <button
            v-for="tutorial in tutorials"
            :key="tutorial.id"
            type="button"
            class="tutorial-menu-item"
            @click="$emit('start', tutorial.id)"
          >
            <span class="tutorial-menu-item-header">
              <span class="tutorial-menu-item-title">{{ tutorial.title }}</span>
              <span class="tutorial-menu-item-status">{{ statusLabel(tutorial) }}</span>
            </span>
            <span class="tutorial-menu-item-description">{{ tutorial.description }}</span>
            <span
              class="tutorial-menu-progress"
              role="progressbar"
              :aria-valuenow="Math.round(ratio(tutorial) * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="tutorial.title + ' completion'"
            >
              <span
                class="tutorial-menu-progress-fill"
                :class="{ complete: ratio(tutorial) >= 1 }"
                :style="{ width: (ratio(tutorial) * 100) + '%' }"
              ></span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { tutorials, readProgress, completionRatio } from '../../lib/Tutorial/tutorials';
import type { TutorialDef } from '../../lib/Tutorial/tutorials';

// Non-reactive instance state, assigned in mounted() (not data()) on purpose.
// Typed through the `self` cast below — a typing-only view, self === this.
interface TutorialMenuInternal {
  handleEscape: (event: KeyboardEvent) => void;
}

export default defineComponent({
  name: 'TutorialMenu',
  props: {
    show: { type: Boolean, default: false },
  },
  emits: ['close', 'start'],
  data() {
    return {
      tutorials,
      progress: readProgress(),
    };
  },
  watch: {
    // Progress may have changed while the menu was closed (a tutorial ran).
    show(isShown: boolean) {
      if (isShown) this.progress = readProgress();
    },
  },
  mounted() {
    const self = this as typeof this & TutorialMenuInternal;
    self.handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.show) this.$emit('close');
    };
    document.addEventListener('keydown', self.handleEscape);
  },
  beforeUnmount() {
    const self = this as typeof this & TutorialMenuInternal;
    document.removeEventListener('keydown', self.handleEscape);
  },
  methods: {
    ratio(tutorial: TutorialDef): number {
      return completionRatio(tutorial, this.progress);
    },
    statusLabel(tutorial: TutorialDef): string {
      const ratio = this.ratio(tutorial);
      if (ratio >= 1) return 'Completed';
      if (ratio > 0) return `${Math.round(ratio * 100)}%`;
      return 'Not started';
    },
  },
});
</script>

<style>
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. */
.tutorial-menu-container {
  max-width: 480px;
  padding: 32px;
}

.tutorial-menu-content {
  display: flex;
  flex-direction: column;
  font-family: var(--font-regular);
  color: var(--text-primary);
  text-align: left;
}

.tutorial-menu-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 2em;
  margin: 0 0 6px 0;
}

.tutorial-menu-content .subtitle {
  font-size: 1em;
  color: var(--text-muted);
  margin: 0 0 24px 0;
}

.tutorial-menu-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  cursor: pointer;
  font-family: var(--font-regular);
  color: var(--text-primary);
  transition: transform 0.15s ease;
}

.tutorial-menu-item:hover {
  transform: translate(1px, -1px);
}

.tutorial-menu-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tutorial-menu-item-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.tutorial-menu-item-title {
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
}

.tutorial-menu-item-status {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.tutorial-menu-item-description {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
}

.tutorial-menu-progress {
  display: block;
  height: 6px;
  margin-top: 4px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.tutorial-menu-progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.tutorial-menu-progress-fill.complete {
  background: var(--success);
}
</style>
