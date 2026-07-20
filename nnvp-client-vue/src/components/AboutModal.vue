<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div
        ref="container"
        class="modal-surface modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        tabindex="-1"
        @click.stop
      >
        <button class="modal-close" @click="closeModal" aria-label="Close">&times;</button>

        <div class="modal-content">
          <h1 id="about-modal-title">NNVP</h1>
          <p class="subtitle">Neural Network Visual Programming</p>

          <section>
            <h2>What is NNVP?</h2>
            <p>
              NNVP is a browser-based tool that lets you <strong>visually design Keras neural networks</strong>
              by drawing a graph, then automatically generates the corresponding Python code.
            </p>
          </section>

          <section>
            <h2>Tutorials</h2>
            <p>
              New here? Guided tutorials walk you through the editor hands-on —
              from placing your first layer to training a network. Track your
              progress from the tutorial menu.
            </p>
            <button type="button" class="about-tutorials-button" @click="openTutorials">
              Open the tutorial menu
            </button>
          </section>

          <section>
            <h2>Open Source</h2>
            <p>
              NNVP is <strong>open source</strong> under the MIT License.
              The codebase originated from university work and is now maintained in personal time.
            </p>
            <p>
              We welcome contributions! Check out the project on
              <a href="https://github.com/c4ffein/NNVP" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

// Non-reactive instance field assigned outside data() (pure typing pass:
// keeping it out of data() preserves its non-reactive nature).
interface AboutModalInstanceExtra { previouslyFocused?: Element | null }

export default defineComponent({
  name: 'AboutModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
  },
  watch: {
    show(isOpen: boolean) {
      if (isOpen) this.onOpen();
      else this.restoreFocus();
    },
  },
  methods: {
    closeModal() {
      this.$emit('close');
    },
    openTutorials() {
      this.$emit('open-tutorials');
    },
    onOpen() {
      // Remember what had focus so we can return it when the dialog closes.
      (this as unknown as AboutModalInstanceExtra).previouslyFocused = document.activeElement;
      this.$nextTick(() => {
        const container = this.$refs.container as HTMLElement | undefined;
        if (!container) return;
        const focusable = container.querySelector<HTMLElement>('button, a[href]');
        (focusable || container).focus();
      });
    },
    restoreFocus() {
      const self = this as unknown as AboutModalInstanceExtra;
      const previouslyFocused = self.previouslyFocused as HTMLElement | null | undefined;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      self.previouslyFocused = null;
    },
    handleKeydown(event: KeyboardEvent) {
      if (!this.show) return;
      if (event.key === 'Escape') {
        this.closeModal();
      } else if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    },
    trapFocus(event: KeyboardEvent) {
      const container = this.$refs.container as HTMLElement | undefined;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeydown);
    if (this.show) this.onOpen();
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
  },
});
</script>

<style scoped>
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. */
.modal-container {
  max-width: 480px;
  padding: 32px;
}

.modal-content {
  line-height: 1.6;
}

.modal-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 2em;
  margin: 0 0 6px 0;
  color: var(--text-primary);
  text-align: left;
}

.subtitle {
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  font-size: 1em;
  color: var(--text-muted);
  margin: 0 0 24px 0;
  text-align: left;
}

.modal-content h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.2em;
  margin: 24px 0 12px 0;
  color: var(--text-primary);
  border-bottom: 1px solid var(--panel-border);
  padding-bottom: 6px;
}

.modal-content section:first-of-type h2 {
  margin-top: 0;
}

.modal-content p {
  margin: 0 0 12px 0;
  font-size: 0.95em;
}

.modal-content a {
  color: var(--accent);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  display: inline-block;
  transition: transform 0.15s ease;
}

.modal-content a:hover {
  transform: translate(1px, -1px);
  cursor: pointer;
}

.tech-stack {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tech-stack li {
  padding: 8px 0;
  border-bottom: 1px solid var(--panel-border);
}

.tech-stack li:last-child {
  border-bottom: none;
}

.tech-stack strong {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.about-tutorials-button {
  margin-top: 4px;
  padding: 8px 16px;
  font-family: var(--font-regular);
  font-size: 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.about-tutorials-button:hover {
  transform: translate(1px, -1px);
}

.about-tutorials-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}


/* Scrollbar styling */
.modal-container::-webkit-scrollbar {
  width: 8px;
}

.modal-container::-webkit-scrollbar-track {
  background: var(--bg-elevated);
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb {
  background: var(--input-border);
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb:hover {
  opacity: 0.7;
}
</style>
