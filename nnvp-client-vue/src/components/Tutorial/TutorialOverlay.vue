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
        <span class="tutorial-progress">{{ progressLabel }}</span>
        <span class="tutorial-card-actions">
          <button class="tutorial-menu-link" type="button" @click="openMenu">All tutorials</button>
          <button class="tutorial-exit" type="button" @click="exit">Exit</button>
        </span>
      </div>
      <h3 class="tutorial-title">{{ step.title }}</h3>
      <p class="tutorial-instruction">{{ step.instruction }}</p>
      <p v-if="step.detail" class="tutorial-detail">{{ step.detail }}</p>
      <div v-if="conceptLinks.length" class="tutorial-concept-links">
        <button
          v-for="link in conceptLinks"
          :key="link.id"
          type="button"
          class="tutorial-concept-link"
          @click="$emit('concept', link.id)"
        >📖 Learn: {{ link.title }}</button>
      </div>
      <div class="tutorial-card-footer">
        <button
          class="tutorial-btn"
          type="button"
          :disabled="currentStep === 0"
          @click="back"
        >Back</button>
        <span v-if="stepComplete" class="tutorial-done">✓ Done</span>
        <button
          v-if="step.action"
          class="tutorial-btn"
          type="button"
          @click="runStepAction"
        >Do it for me</button>
        <button
          v-if="currentStep < totalSteps - 1"
          class="tutorial-btn tutorial-btn-primary"
          type="button"
          @click="next"
        >Next</button>
        <button
          v-else-if="nextId"
          class="tutorial-btn tutorial-btn-primary"
          type="button"
          @click="nextLesson"
        >Next lesson →</button>
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

<script lang="ts">
import { defineComponent } from 'vue';
import type { ComponentPublicInstance, PropType } from 'vue';
import { markStepReached, markCompleted } from '../../lib/Tutorial/tutorials';
import type { TutorialDef } from '../../lib/Tutorial/tutorials';
import type { TutorialStep } from '../../lib/Tutorial/predicates';
import { chaptersOf, nextChapterId } from '../../lib/Tutorial/course';
import { getConcept } from '../../lib/Tutorial/concepts';
import FloatingWindow from '../FloatingWindow.vue';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Non-reactive instance state, assigned in mounted()/startTutorial() (not
// data()) on purpose. Typed through the `self` cast — typing-only, self === this.
interface TutorialOverlayInternal {
  stateChangeHandler: () => void;
  reposition: () => void;
  handleKeydown: (event: KeyboardEvent) => void;
  pollTimer?: ReturnType<typeof setInterval> | null;
}

export default defineComponent({
  name: 'TutorialOverlay',
  components: { FloatingWindow },
  emits: ['exit', 'open-menu', 'next', 'concept'],
  props: {
    active: {
      type: Boolean,
      default: false,
    },
    // The tutorial definition to play ({ id, title, steps }); the overlay is a
    // generic engine, the definitions live in lib/Tutorial/tutorials.js.
    tutorial: {
      type: Object as PropType<TutorialDef | null>,
      default: null,
    },
  },
  data() {
    const width = Math.min(440, window.innerWidth - 48);
    const height = 290; // room for the optional detail explainer
    return {
      // Opens bottom-center, like the fixed card used to.
      cardRect: {
        x: Math.round((window.innerWidth - width) / 2),
        y: Math.max(12, window.innerHeight - 24 - height),
        width,
        height,
      },
      currentStep: 0,
      // Auto-advance gate: the deepest step reached this play-through. A user
      // who navigates Back can read a completed step in peace — only the
      // furthest step auto-advances (predicates are mostly monotonic, so
      // anything behind it would otherwise snap forward instantly).
      furthestStep: 0,
      stepComplete: false,
      highlight: null as HighlightRect | null,
    };
  },
  computed: {
    steps(): TutorialStep[] {
      return this.tutorial ? this.tutorial.steps : [];
    },
    totalSteps(): number {
      return this.steps.length;
    },
    /** The step's Concepts-book links (unknown ids silently dropped). */
    conceptLinks(): { id: string; title: string }[] {
      const ids = (this.step && this.step.concepts) || [];
      return ids
        .map((id) => ({ id, title: getConcept(id)?.title ?? '' }))
        .filter(link => link.title !== '');
    },
    /** The next course chapter's id, or null outside a course / at the end. */
    nextId(): string | null {
      return this.tutorial && this.tutorial.course ? nextChapterId(this.tutorial.id) : null;
    },
    progressLabel(): string {
      const stepPart = `Step ${this.currentStep + 1} / ${this.totalSteps}`;
      const course = this.tutorial && this.tutorial.course;
      if (!course) return stepPart;
      return `Chapter ${course.order} / ${chaptersOf(course.id).length} · ${stepPart}`;
    },
    // `!` preserves the original behavior: an out-of-range index was already
    // possible in JS and consumers guard (try/catch) or render nothing.
    step(): TutorialStep {
      return this.steps[this.currentStep]!;
    },
  },
  watch: {
    active(isActive: boolean) {
      if (isActive) {
        this.startTutorial();
      } else {
        this.teardown();
      }
    },
    // Chaining swaps the def while the overlay stays active: full reset, and
    // teardown first so the board/bus subscriptions are never doubled.
    tutorial() {
      if (this.active) {
        this.teardown();
        this.startTutorial();
      }
    },
    currentStep(step: number) {
      this.furthestStep = Math.max(this.furthestStep, step);
      if (this.tutorial) markStepReached(this.tutorial.id, step);
      this.refreshState();
    },
  },
  mounted() {
    const self = this as typeof this & TutorialOverlayInternal;
    // Bound handlers reused for subscribe/unsubscribe.
    self.stateChangeHandler = () => this.checkCompletion();
    self.reposition = () => this.updateHighlight();
    self.handleKeydown = (event: KeyboardEvent) => {
      if (this.active && event.key === 'Escape') this.exit();
    };
    if (this.active) this.startTutorial();
  },
  beforeUnmount() {
    this.teardown();
  },
  methods: {
    startTutorial() {
      const self = this as typeof this & TutorialOverlayInternal;
      this.currentStep = 0;
      this.furthestStep = 0;
      this.stepComplete = false;
      this.$boardInterface.on('graph-changed', self.stateChangeHandler);
      this.$boardInterface.on('selection-changed', self.stateChangeHandler);
      window.addEventListener('resize', self.reposition);
      window.addEventListener('scroll', self.reposition, true);
      document.addEventListener('keydown', self.handleKeydown);
      // Poll as a backup: some state changes (e.g. editing a parameter value)
      // do not necessarily emit graph-changed.
      self.pollTimer = setInterval(() => this.checkCompletion(), 500);
      this.$nextTick(() => {
        this.refreshState();
        const card = this.$refs.card as ComponentPublicInstance | undefined;
        if (card && card.$el) {
          // preventScroll: focusing must not scroll the overflow-hidden app
          // container (that would visually shift every absolute panel).
          card.$el.focus({ preventScroll: true });
        }
      });
    },
    teardown() {
      const self = this as typeof this & TutorialOverlayInternal;
      this.$boardInterface.off('graph-changed', self.stateChangeHandler);
      this.$boardInterface.off('selection-changed', self.stateChangeHandler);
      window.removeEventListener('resize', self.reposition);
      window.removeEventListener('scroll', self.reposition, true);
      document.removeEventListener('keydown', self.handleKeydown);
      if (self.pollTimer) {
        clearInterval(self.pollTimer);
        self.pollTimer = null;
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
        complete = this.step.isComplete(this.$boardInterface);
      } catch {
        complete = false;
      }
      this.stepComplete = complete;
      if (!complete) return;
      if (this.currentStep < this.totalSteps - 1) {
        // Auto-advance only from the furthest step reached: a step the user
        // navigated Back to just shows "✓ Done" and waits for Next.
        if (this.currentStep === this.furthestStep) this.currentStep += 1;
      } else if (this.tutorial) {
        // Last step done by actually performing it (not just Finish-clicked).
        markCompleted(this.tutorial.id);
      }
    },
    /** Interpret the step's declarative "Do it for me" action. */
    runStepAction() {
      const action = this.step && this.step.action;
      if (!action || action.kind !== 'loadTemplate') return;
      try {
        const names = this.$boardInterface.getTemplatesContainer().e || [];
        if (!names.includes(action.template)) return;
        this.$boardInterface.loadTemplate(action.template);
      } catch {
        // The overlay must never crash the app; the predicate simply stays
        // unfulfilled and the user can follow the manual path.
      }
    },
    /** Course chaining: complete this chapter and ask App to start the next. */
    nextLesson() {
      if (this.tutorial) markCompleted(this.tutorial.id);
      if (this.nextId) {
        this.$emit('next', this.nextId);
      } else {
        this.exit();
      }
    },
    resolveTarget(): Element | null {
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
});
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
  margin: 0 0 10px 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-muted);
}

/* The step's links into the Concepts book. */
.tutorial-concept-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px 0;
}

.tutorial-concept-link {
  display: inline-block;
  padding: 3px 10px;
  background: transparent;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-family: var(--font-regular);
  font-size: 12.5px;
  cursor: pointer;
}
.tutorial-concept-link:hover {
  background: var(--bg-hover);
}

/* The optional "why" explainer under the instruction. */
.tutorial-detail {
  margin: 0 0 14px 0;
  font-size: 13px;
  line-height: 1.45;
  font-style: italic;
  color: var(--text-muted);
  opacity: 0.85;
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
