<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay concept-book-overlay" @click="$emit('close')">
      <div
        class="modal-surface concept-book-container"
        role="dialog"
        aria-modal="true"
        aria-label="Concepts book"
        @click.stop
      >
        <button class="modal-close" @click="$emit('close')" aria-label="Close">&times;</button>

        <!-- Table of contents -->
        <div v-if="!concept" class="concept-book-content">
          <div v-if="showNudge" class="concept-nudge" role="note">
            <span class="concept-nudge-text">You're in the middle of a lesson.</span>
            <button type="button" class="concept-nudge-back" @click="$emit('close')">← Back to the lesson</button>
            <button type="button" class="concept-nudge-dismiss" aria-label="Dismiss" @click="nudgeDismissed = true">&times;</button>
          </div>
          <h1>Concepts</h1>
          <p class="subtitle">
            What is actually happening in there — the theory behind everything
            you build here, drawn as much as told.
          </p>
          <div class="concept-scroll">
          <template v-for="part in parts" :key="part">
            <h2 class="concept-part-title">{{ part }}</h2>
            <button
              v-for="entry in conceptsIn(part)"
              :key="entry.id"
              type="button"
              class="concept-toc-item"
              @click="$emit('select', entry.id)"
            >
              <span class="concept-toc-header">
                <span class="concept-toc-title">{{ entry.title }}</span>
                <span v-if="readIds.has(entry.id)" class="concept-toc-read" aria-label="read">✓</span>
              </span>
              <span class="concept-toc-hook">{{ entry.hook }}</span>
            </button>
          </template>
          <div v-if="showNudge" class="concept-nudge" role="note">
            <span class="concept-nudge-text">Ready to continue?</span>
            <button type="button" class="concept-nudge-back" @click="$emit('close')">← Back to the lesson</button>
            <button type="button" class="concept-nudge-dismiss" aria-label="Dismiss" @click="nudgeDismissed = true">&times;</button>
          </div>
          </div>
        </div>

        <!-- One article -->
        <div v-else class="concept-book-content">
          <div v-if="showNudge" class="concept-nudge" role="note">
            <span class="concept-nudge-text">You're in the middle of a lesson.</span>
            <button type="button" class="concept-nudge-back" @click="$emit('close')">← Back to the lesson</button>
            <button type="button" class="concept-nudge-dismiss" aria-label="Dismiss" @click="nudgeDismissed = true">&times;</button>
          </div>
          <div class="concept-article-nav">
            <button type="button" class="concept-nav-link" @click="$emit('select', null)">
              ☰ Contents
            </button>
            <span class="concept-article-part">{{ concept.part }}</span>
          </div>
          <div class="concept-scroll">
          <h1 class="concept-article-title">{{ concept.title }}</h1>
          <!-- Checked-in, trusted content (see concepts/index.ts) — the
               layerHelp v-html precedent. Clicks on <a data-concept> anchors
               are delegated here for cross-links. -->
          <div class="concept-body" v-html="concept.body" @click="onBodyClick"></div>
          <div v-if="relatedConcepts.length" class="concept-related">
            <span class="concept-related-label">Related:</span>
            <button
              v-for="related in relatedConcepts"
              :key="related.id"
              type="button"
              class="concept-nav-link"
              @click="$emit('select', related.id)"
            >{{ related.title }}</button>
          </div>
          <div class="concept-article-footer">
            <button
              v-if="prevId"
              type="button"
              class="concept-nav-link"
              @click="$emit('select', prevId)"
            >← {{ titleOf(prevId) }}</button>
            <span v-else></span>
            <button
              v-if="nextId"
              type="button"
              class="concept-nav-link concept-nav-next"
              @click="$emit('select', nextId)"
            >{{ titleOf(nextId) }} →</button>
          </div>
          <div v-if="showNudge" class="concept-nudge" role="note">
            <span class="concept-nudge-text">Ready to continue?</span>
            <button type="button" class="concept-nudge-back" @click="$emit('close')">← Back to the lesson</button>
            <button type="button" class="concept-nudge-dismiss" aria-label="Dismiss" @click="nudgeDismissed = true">&times;</button>
          </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import {
  concepts, getConcept, conceptParts, nextConceptId, prevConceptId,
} from '../../lib/Tutorial/concepts';
import type { ConceptDef } from '../../lib/Tutorial/concepts';
import { readConceptIds, markConceptRead } from '../../lib/Tutorial/concepts/readState';

// Non-reactive instance state (the TutorialMenu pattern).
interface ConceptBookInternal {
  handleEscape: (event: KeyboardEvent) => void;
}

export default defineComponent({
  name: 'ConceptBook',
  props: {
    show: { type: Boolean, default: false },
    /** The open article's id; null shows the table of contents. */
    conceptId: { type: String as () => string | null, default: null },
    /** A guided lesson is running: nudge the reader back to it. */
    lessonActive: { type: Boolean, default: false },
  },
  emits: ['close', 'select'],
  data() {
    return {
      readIds: readConceptIds(),
      // Per-visit dismissal of the back-to-lesson nudge (× resets on reopen).
      nudgeDismissed: false,
    };
  },
  computed: {
    concept(): ConceptDef | null {
      return this.conceptId ? getConcept(this.conceptId) ?? null : null;
    },
    parts(): string[] {
      return conceptParts();
    },
    relatedConcepts(): ConceptDef[] {
      if (!this.concept) return [];
      return this.concept.related
        .map(id => getConcept(id))
        .filter((entry): entry is ConceptDef => !!entry);
    },
    nextId(): string | null {
      return this.conceptId ? nextConceptId(this.conceptId) : null;
    },
    prevId(): string | null {
      return this.conceptId ? prevConceptId(this.conceptId) : null;
    },
    showNudge(): boolean {
      return this.lessonActive && !this.nudgeDismissed;
    },
  },
  watch: {
    show(isShown: boolean) {
      if (isShown) {
        this.readIds = readConceptIds();
        this.nudgeDismissed = false;
        this.recordRead();
      }
    },
    conceptId() {
      if (this.show) this.recordRead();
      // A new article always starts at its top.
      this.$nextTick(() => {
        const scroller = this.$el?.querySelector?.('.concept-scroll');
        if (scroller) scroller.scrollTop = 0;
      });
    },
  },
  mounted() {
    const self = this as typeof this & ConceptBookInternal;
    self.handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.show) this.$emit('close');
    };
    document.addEventListener('keydown', self.handleEscape);
  },
  beforeUnmount() {
    const self = this as typeof this & ConceptBookInternal;
    document.removeEventListener('keydown', self.handleEscape);
  },
  methods: {
    conceptsIn(part: string): ConceptDef[] {
      return concepts.filter(concept => concept.part === part);
    },
    titleOf(id: string): string {
      return getConcept(id)?.title ?? '';
    },
    recordRead() {
      if (!this.conceptId || !getConcept(this.conceptId)) return;
      markConceptRead(this.conceptId);
      this.readIds = readConceptIds();
    },
    /** Cross-links inside articles: <a data-concept="id">…</a>. */
    onBodyClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const link = target?.closest?.('[data-concept]');
      const id = link?.getAttribute('data-concept');
      if (id && getConcept(id)) {
        event.preventDefault();
        this.$emit('select', id);
      }
    },
  },
});
</script>

<style>
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. */
.concept-book-overlay {
  /* Above the tutorial overlay (z 2000): the card's "Learn" link opens the
     book on top of the running tutorial. */
  z-index: 2100;
}

.concept-book-container {
  max-width: 620px;
  padding: 32px 36px;
  /* The skin scrolls the whole surface; here the title (contents) or the
     nav bar (article) stays pinned and only .concept-scroll scrolls —
     same anatomy as the tutorial menu's chapter list. */
  overflow-y: hidden;
  display: flex;
  flex-direction: column;
}

.concept-book-content {
  font-family: var(--font-regular);
  color: var(--text-primary);
  text-align: left;
  display: flex;
  flex-direction: column;
  min-height: 0; /* let the scroll region shrink below its content height */
}

/* The back-to-lesson nudge: pinned above the scroll region, echoed at the
   bottom of it. Dismissible per visit. */
.concept-nudge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  margin: 0 0 12px 0;
  background: var(--bg-elevated);
  border: 1px solid var(--accent);
  border-radius: 10px;
  font-size: 12.5px;
}
.concept-scroll .concept-nudge { margin: 14px 0 2px 0; }

.concept-nudge-text { color: var(--text-muted); }

.concept-nudge-back {
  background: var(--accent);
  border: none;
  border-radius: 999px;
  color: var(--accent-text);
  font-family: var(--font-regular);
  font-size: 12.5px;
  padding: 3px 12px;
  cursor: pointer;
}

.concept-nudge-dismiss {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  padding: 0 4px;
}
.concept-nudge-dismiss:hover { color: var(--text-primary); }

.concept-scroll {
  overflow-y: auto;
  min-height: 0;
  /* Reaching the ends must not chain the scroll to the board behind. */
  overscroll-behavior: contain;
  /* Breathing room so hover lift and focus rings aren't clipped. */
  padding: 2px;
  margin: -2px;
}

.concept-book-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.9em;
  margin: 0 0 6px 0;
}

.concept-book-content .subtitle {
  font-size: 1em;
  color: var(--text-muted);
  margin: 0 0 20px 0;
}

/* --- table of contents --- */

.concept-part-title {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.05em;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 18px 0 8px 0;
}

.concept-toc-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  margin-bottom: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  cursor: pointer;
  font-family: var(--font-regular);
  color: var(--text-primary);
  transition: transform 0.15s ease;
}

.concept-toc-item:hover { transform: translate(1px, -1px); }
.concept-toc-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.concept-toc-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.concept-toc-title { font-size: 14px; font-weight: var(--font-weight-semibold); }
.concept-toc-read { color: var(--success); font-size: 13px; }
.concept-toc-hook { font-size: 12.5px; color: var(--text-muted); line-height: 1.4; }

/* --- article --- */

.concept-article-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.concept-article-part {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.concept-article-title { margin-bottom: 12px !important; }

.concept-nav-link {
  background: transparent;
  border: none;
  color: var(--accent);
  font-family: var(--font-regular);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}
.concept-nav-link:hover { text-decoration: underline; }

.concept-body { font-size: 14px; line-height: 1.6; }
.concept-body p { margin: 0 0 12px 0; }
.concept-body ul { margin: 0 0 12px 0; padding-left: 22px; }
.concept-body li { margin-bottom: 6px; }
.concept-body h3 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.1em;
  margin: 18px 0 8px 0;
}
.concept-body code {
  background: var(--bg-hover);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.9em;
}

.concept-body .concept-lead { font-size: 15px; color: var(--text-primary); }

.concept-body figure {
  margin: 16px 0;
  padding: 12px 12px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
}
.concept-body .concept-fig { width: 100%; height: auto; display: block; }
.concept-body figcaption {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
}

.concept-fig-row { display: flex; gap: 10px; flex-wrap: wrap; }
.concept-fig-row figure { flex: 1 1 160px; margin: 8px 0; }

.concept-body [data-concept] {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.concept-body .concept-signoff {
  font-family: var(--font-medium);
  font-style: italic;
  text-align: right;
  color: var(--text-primary);
}

.concept-body .concept-try {
  padding: 10px 14px;
  background: var(--bg-elevated);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  color: var(--text-primary);
}

.concept-related {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin: 14px 0 4px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-border);
}
.concept-related-label { font-size: 12px; color: var(--text-muted); }

.concept-article-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-border);
}
.concept-nav-next { font-weight: var(--font-weight-medium); }
</style>
