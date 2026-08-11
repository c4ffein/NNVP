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
            type="button"
            class="tutorial-menu-item concepts-book-link"
            :class="{ dimmed: !courseStarted }"
            @click="onBookClick"
          >
            <span class="tutorial-menu-item-header">
              <span class="tutorial-menu-item-title">📖 Concepts — the book</span>
            </span>
            <span class="tutorial-menu-item-description">
              The reference behind the lessons — a wiki of illustrated articles,
              linked from every chapter step.
            </span>
          </button>
          <div class="course-header">
            <span class="tutorial-menu-item-header">
              <span class="course-title">{{ course.title }}</span>
              <span class="tutorial-menu-item-status">{{ courseStatusLabel }}</span>
            </span>
            <span class="tutorial-menu-item-description">{{ course.description }}</span>
            <span
              class="tutorial-menu-progress course-progress"
              role="progressbar"
              :aria-valuenow="Math.round(courseRatio * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="course.title + ' completion'"
            >
              <span
                class="tutorial-menu-progress-fill"
                :class="{ complete: courseRatio >= 1 }"
                :style="{ width: (courseRatio * 100) + '%' }"
              ></span>
            </span>
          </div>
          <div class="tutorial-menu-list">
          <button
            v-for="chapter in courseChapters"
            :key="chapter.id"
            type="button"
            class="tutorial-menu-item"
            :class="{ 'next-up': chapter.id === nextUpId }"
            @click="$emit('start', chapter.id)"
          >
            <span class="tutorial-menu-item-header">
              <span class="tutorial-menu-item-title">{{ chapterLabel(chapter) }}</span>
              <span
                class="tutorial-menu-item-status"
                :class="{ 'status-next-up': chapter.id === nextUpId }"
              >{{ chapter.id === nextUpId ? nextUpLabel(chapter) : statusLabel(chapter) }}</span>
            </span>
            <span class="tutorial-menu-item-description">{{ chapter.description }}</span>
            <span
              class="tutorial-menu-progress"
              role="progressbar"
              :aria-valuenow="Math.round(ratio(chapter) * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="chapter.title + ' completion'"
            >
              <span
                class="tutorial-menu-progress-fill"
                :class="{ complete: ratio(chapter) >= 1 }"
                :style="{ width: (ratio(chapter) * 100) + '%' }"
              ></span>
            </span>
          </button>
          <template v-if="otherTutorials.length">
            <h2 class="more-tutorials-title">More tutorials</h2>
            <button
              v-for="tutorial in otherTutorials"
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
          </template>
          </div>
        </div>

        <!-- Fresh-user interstitial: the course is the intended first door;
             the book stays one honest click further. -->
        <div v-if="showBookInterstitial" class="book-interstitial-overlay" @click="showBookInterstitial = false">
          <div class="book-interstitial" role="dialog" aria-label="Start with the course?" @click.stop>
            <button class="modal-close" aria-label="Close" @click="showBookInterstitial = false">&times;</button>
            <h2>Start with the course?</h2>
            <p>
              The book is a wiki — fourteen illustrated articles, in no
              particular hurry. The course is a story: it teaches the same
              ideas in the right order, hands-on, and links each article at
              exactly the moment it makes sense. It's also just more fun.
            </p>
            <button type="button" class="book-interstitial-start" @click="startCourseFromInterstitial">
              ▶ Start the course
            </button>
            <button type="button" class="book-interstitial-anyway" @click="openBookAnyway">
              I'd rather browse the book first →
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { tutorials, readProgress, completionRatio } from '../../lib/Tutorial/tutorials';
import type { TutorialDef } from '../../lib/Tutorial/tutorials';
import { browserPoetCourse, chaptersOf, courseCompletionRatio } from '../../lib/Tutorial/course';

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
  emits: ['close', 'start', 'open-concepts'],
  data() {
    return {
      tutorials,
      course: browserPoetCourse,
      progress: readProgress(),
      showBookInterstitial: false,
    };
  },
  computed: {
    courseChapters(): TutorialDef[] {
      return chaptersOf(this.course.id);
    },
    /** Any registered tutorial that is not a course chapter (none today). */
    otherTutorials(): TutorialDef[] {
      return this.tutorials.filter(tutorial => !tutorial.course);
    },
    courseRatio(): number {
      return courseCompletionRatio(this.course.id, this.progress);
    },
    courseStatusLabel(): string {
      const ratio = this.courseRatio;
      if (ratio >= 1) return 'Completed';
      if (ratio > 0) return `${Math.round(ratio * 100)}%`;
      return 'Not started';
    },
    /** The chapter to shine: the first one not yet completed. */
    nextUpId(): string | null {
      const next = this.courseChapters.find(chapter => this.ratio(chapter) < 1);
      return next ? next.id : null;
    },
    /** Any recorded trail at all — the book undims once the course began. */
    courseStarted(): boolean {
      return Object.keys(this.progress).length > 0;
    },
  },
  watch: {
    // Progress may have changed while the menu was closed (a tutorial ran).
    show(isShown: boolean) {
      if (isShown) {
        this.progress = readProgress();
        this.showBookInterstitial = false;
      }
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
    nextUpLabel(chapter: TutorialDef): string {
      return this.ratio(chapter) > 0 ? 'Continue →' : 'Start →';
    },
    /** Fresh users get the recommendation first; everyone else, the book. */
    onBookClick() {
      if (this.courseStarted) {
        this.$emit('open-concepts');
      } else {
        this.showBookInterstitial = true;
      }
    },
    startCourseFromInterstitial() {
      this.showBookInterstitial = false;
      this.$emit('start', this.nextUpId ?? this.courseChapters[0]!.id);
    },
    openBookAnyway() {
      this.showBookInterstitial = false;
      this.$emit('open-concepts');
    },
    chapterLabel(chapter: TutorialDef): string {
      return chapter.course
        ? `Chapter ${chapter.course.order} — ${chapter.title}`
        : chapter.title;
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
  /* The skin scrolls the whole surface (title and all); here the title and
     course header stay pinned and only the chapter list scrolls. */
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
}

.tutorial-menu-content {
  display: flex;
  flex-direction: column;
  font-family: var(--font-regular);
  color: var(--text-primary);
  text-align: left;
  min-height: 0; /* let the list shrink below its content height and scroll */
}

.tutorial-menu-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  /* Same scroll containment as the surface skin: reaching the ends must not
     chain the scroll to the board behind the dialog. */
  overscroll-behavior: contain;
  /* Breathing room so hover lift and focus rings aren't clipped. */
  padding: 2px;
  margin: -2px;
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

/* The book card sits up top but stays quiet; before the course has ever been
   started it dims hard, and clicking it politely argues for the course first
   (the interstitial below). */
.concepts-book-link {
  opacity: 0.8;
  margin-bottom: 14px;
}
.concepts-book-link .tutorial-menu-item-title {
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}
.concepts-book-link:hover {
  opacity: 1;
}
.concepts-book-link.dimmed {
  opacity: 0.4;
  filter: grayscale(1);
}
.concepts-book-link.dimmed:hover {
  opacity: 0.65;
}

/* Fresh-user interstitial over the menu. */
.book-interstitial-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.book-interstitial {
  position: relative;
  max-width: 400px;
  width: calc(100% - 48px);
  padding: 26px 28px;
  background: var(--bg-panel);
  border: 1px solid var(--panel-border);
  border-radius: var(--border-radius);
  box-shadow: var(--panel-shadow);
  text-align: left;
}

.book-interstitial h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.25em;
  margin: 0 0 10px 0;
}

.book-interstitial p {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-muted);
  margin: 0 0 16px 0;
}

.book-interstitial-start {
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: var(--accent);
  border: none;
  border-radius: 10px;
  color: var(--accent-text);
  font-family: var(--font-regular);
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.book-interstitial-start:hover { transform: translate(1px, -1px); }

.book-interstitial-anyway {
  display: block;
  margin: 12px auto 0;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-regular);
  font-size: 12.5px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.book-interstitial-anyway:hover { color: var(--text-primary); }

/* The next chapter to play shines — the menu's one clear call to action. */
.tutorial-menu-item.next-up {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 0 14px rgba(37, 99, 235, 0.25);
  animation: next-up-shine 2.4s ease-in-out infinite;
}

.status-next-up {
  color: var(--accent) !important;
  font-weight: var(--font-weight-semibold);
}

@keyframes next-up-shine {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent), 0 0 6px rgba(37, 99, 235, 0.15); }
  50% { box-shadow: 0 0 0 1px var(--accent), 0 0 16px rgba(37, 99, 235, 0.35); }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-menu-item.next-up { animation: none; }
}

/* The course header: same anatomy as an item, but not clickable. */
.course-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 2px 14px;
}

.course-title {
  font-size: 16px;
  font-weight: var(--font-weight-semibold);
}

.course-progress {
  height: 8px;
  border-radius: 4px;
}

.more-tutorials-title {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.1em;
  margin: 14px 0 10px 0;
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
