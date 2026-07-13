<template>
  <div v-if="active && tutorial" class="tutorial-overlay">
    <!-- Coachmark ring highlighting the current step's target element -->
    <div
      v-if="highlight"
      class="tutorial-highlight"
      :style="{
        top: highlight.top + 'px',
        left: highlight.left + 'px',
        width: highlight.width + 'px',
        height: highlight.height + 'px',
      }"
    ></div>

    <!-- Floating instruction card: a movable window, opens bottom-center -->
    <FloatingWindow
      ref="card"
      window-id="tutorial"
      class="tutorial-card"
      role="dialog"
      aria-label="Tutorial step"
      tabindex="-1"
      title="Tutorial"
      :initial="cardRect"
      :min-width="360"
      :min-height="210"
      @close="exit"
    >
      <div class="tutorial-card-content">
      <div class="tutorial-card-header">
        <span class="tutorial-progress">Step {{ currentStep + 1 }} / {{ totalSteps }}</span>
        <span class="tutorial-card-actions">
          <button class="tutorial-menu-link" type="button" @click="openMenu">All tutorials</button>
          <button class="tutorial-exit" type="button" @click="exit">Exit</button>
        </span>
      </div>
      <h3 class="tutorial-title">{{ step.title }}</h3>
      <p class="tutorial-instruction">{{ step.instruction }}</p>
      <div class="tutorial-card-footer">
        <button
          class="tutorial-btn"
          type="button"
          :disabled="currentStep === 0"
          @click="back"
        >Back</button>
        <span v-if="stepComplete" class="tutorial-done">✓ Done</span>
        <button
          v-if="currentStep < totalSteps - 1"
          class="tutorial-btn tutorial-btn-primary"
          type="button"
          @click="next"
        >Next</button>
        <button
          v-else
          class="tutorial-btn tutorial-btn-primary"
          type="button"
          @click="finish"
        >Finish</button>
      </div>
      </div>
    </FloatingWindow>
  </div>
</template>

<script>
import { markStepReached, markCompleted } from '../../lib/Tutorial/tutorials';
import FloatingWindow from '../FloatingWindow.vue';

export default {
  name: 'TutorialOverlay',
  components: { FloatingWindow },
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    // The tutorial definition to play ({ id, title, steps }); the overlay is a
    // generic engine, the definitions live in lib/Tutorial/tutorials.js.
    tutorial: {
      type: Object,
      default: null,
    },
  },
  data() {
    const width = Math.min(440, window.innerWidth - 48);
    return {
      // Opens bottom-center, like the fixed card used to.
      cardRect: {
        x: Math.round((window.innerWidth - width) / 2),
        y: Math.max(12, window.innerHeight - 24 - 240),
        width,
        height: 240,
      },
      currentStep: 0,
      stepComplete: false,
      highlight: null,
    };
  },
  computed: {
    steps() {
      return this.tutorial ? this.tutorial.steps : [];
    },
    totalSteps() {
      return this.steps.length;
    },
    step() {
      return this.steps[this.currentStep];
    },
  },
  watch: {
    active(isActive) {
      if (isActive) {
        this.startTutorial();
      } else {
        this.teardown();
      }
    },
    currentStep(step) {
      if (this.tutorial) markStepReached(this.tutorial.id, step);
      this.refreshState();
    },
  },
  mounted() {
    // Bound handlers reused for subscribe/unsubscribe.
    this.stateChangeHandler = () => this.checkCompletion();
    this.reposition = () => this.updateHighlight();
    this.handleKeydown = (event) => {
      if (this.active && event.key === 'Escape') this.exit();
    };
    if (this.active) this.startTutorial();
  },
  beforeUnmount() {
    this.teardown();
  },
  methods: {
    startTutorial() {
      this.currentStep = 0;
      this.stepComplete = false;
      this.$d3Interface.on('graph-changed', this.stateChangeHandler);
      this.$d3Interface.on('selection-changed', this.stateChangeHandler);
      window.addEventListener('resize', this.reposition);
      window.addEventListener('scroll', this.reposition, true);
      document.addEventListener('keydown', this.handleKeydown);
      // Poll as a backup: some state changes (e.g. editing a parameter value)
      // do not necessarily emit graph-changed.
      this.pollTimer = setInterval(() => this.checkCompletion(), 500);
      this.$nextTick(() => {
        this.refreshState();
        if (this.$refs.card && this.$refs.card.$el) {
          // preventScroll: focusing must not scroll the overflow-hidden app
          // container (that would visually shift every absolute panel).
          this.$refs.card.$el.focus({ preventScroll: true });
        }
      });
    },
    teardown() {
      this.$d3Interface.off('graph-changed', this.stateChangeHandler);
      this.$d3Interface.off('selection-changed', this.stateChangeHandler);
      window.removeEventListener('resize', this.reposition);
      window.removeEventListener('scroll', this.reposition, true);
      document.removeEventListener('keydown', this.handleKeydown);
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.highlight = null;
    },
    refreshState() {
      this.updateHighlight();
      this.checkCompletion();
    },
    checkCompletion() {
      if (!this.active) return;
      let complete = false;
      try {
        complete = this.step.isComplete(this.$d3Interface);
      } catch {
        complete = false;
      }
      this.stepComplete = complete;
      // Auto-advance when the current step becomes complete.
      if (complete && this.currentStep < this.totalSteps - 1) {
        this.currentStep += 1;
      } else if (complete && this.tutorial) {
        // Last step done by actually performing it (not just Finish-clicked).
        markCompleted(this.tutorial.id);
      }
    },
    resolveTarget() {
      const { target } = this.step;
      if (!target) return null;
      if (typeof target === 'function') return target(document);
      return document.querySelector(target);
    },
    updateHighlight() {
      const element = this.resolveTarget();
      if (!element || typeof element.getBoundingClientRect !== 'function') {
        this.highlight = null;
        return;
      }
      const rect = element.getBoundingClientRect();
      const pad = 6;
      this.highlight = {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      };
    },
    next() {
      if (this.currentStep < this.totalSteps - 1) {
        this.currentStep += 1;
      } else {
        this.exit();
      }
    },
    finish() {
      if (this.tutorial) markCompleted(this.tutorial.id);
      this.exit();
    },
    back() {
      if (this.currentStep > 0) {
        this.currentStep -= 1;
      }
    },
    exit() {
      this.$emit('exit');
    },
    openMenu() {
      // Leave the running tutorial (progress is already recorded per step)
      // and hand over to the tutorial menu.
      this.$emit('open-menu');
    },
  },
};
</script>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: none; /* let the user interact with the editor underneath */
}

/* Coachmark ring around the current target element */
.tutorial-highlight {
  position: fixed;
  border: 2px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25), 0 0 0 9999px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
  pointer-events: none;
}

.tutorial-card {
  font-family: var(--font-regular);
  color: var(--text-primary);
  pointer-events: auto; /* the overlay around it is pointer-events: none */
}
.tutorial-card-content {
  padding: 12px 18px 16px;
}

.tutorial-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tutorial-progress {
  font-weight: var(--font-weight-semibold);
  font-size: 13px;
  color: var(--accent);
}

.tutorial-card-actions {
  display: inline-flex;
  gap: 4px;
}

.tutorial-exit,
.tutorial-menu-link {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
}

.tutorial-exit:hover,
.tutorial-menu-link:hover {
  color: var(--text-primary);
}

.tutorial-title {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: var(--font-weight-semibold);
}

.tutorial-instruction {
  margin: 0 0 14px 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-muted);
}

.tutorial-card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.tutorial-done {
  margin-right: auto;
  font-size: 13px;
  font-weight: var(--font-weight-medium);
  color: var(--success);
}

.tutorial-btn {
  font-family: var(--font-regular);
  font-size: 14px;
  padding: 6px 14px;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.tutorial-btn:hover:not(:disabled) {
  transform: translate(1px, -1px);
}

.tutorial-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.tutorial-btn-primary {
  background-color: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
</style>
