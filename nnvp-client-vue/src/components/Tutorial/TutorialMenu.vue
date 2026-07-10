<template>
  <Transition name="modal">
    <div v-if="show" class="tutorial-menu-overlay" @click="$emit('close')">
      <div
        class="tutorial-menu-container"
        role="dialog"
        aria-modal="true"
        aria-label="Tutorials"
        @click.stop
      >
        <button class="tutorial-menu-close" @click="$emit('close')" aria-label="Close">&times;</button>
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

<script>
import { tutorials, readProgress, completionRatio } from '../../lib/Tutorial/tutorials';

export default {
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
    show(isShown) {
      if (isShown) this.progress = readProgress();
    },
  },
  mounted() {
    this.handleEscape = (event) => {
      if (event.key === 'Escape' && this.show) this.$emit('close');
    };
    document.addEventListener('keydown', this.handleEscape);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },
  methods: {
    ratio(tutorial) {
      return completionRatio(tutorial, this.progress);
    },
    statusLabel(tutorial) {
      const ratio = this.ratio(tutorial);
      if (ratio >= 1) return 'Completed';
      if (ratio > 0) return `${Math.round(ratio * 100)}%`;
      return 'Not started';
    },
  },
};
</script>

<style>
/* Same modal look as AboutModal (its styles are scoped, so the base rules are
   duplicated here under tutorial-menu-* class names). */
.tutorial-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--modal-scrim);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding-top: 40px;
}

.tutorial-menu-container {
  background: var(--bg-panel);
  border-radius: 15px;
  border: 1px solid var(--border-color);
  max-width: 480px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  padding: 32px;
}

.tutorial-menu-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 32px;
  line-height: 1;
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.tutorial-menu-close:hover {
  opacity: 0.6;
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
