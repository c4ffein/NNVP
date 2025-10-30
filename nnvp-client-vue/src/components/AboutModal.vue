<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div class="modal-container" @click.stop>
        <button class="modal-close" @click="closeModal" aria-label="Close">&times;</button>

        <div class="modal-content">
          <h1>NNVP</h1>
          <p class="subtitle">Neural Network Visual Programming</p>

          <section>
            <h2>What is NNVP?</h2>
            <p>
              NNVP is a browser-based tool that lets you <strong>visually design Keras neural networks</strong>
              by drawing a graph, then automatically generates the corresponding Python code.
            </p>
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

          <section>
            <h2>Status</h2>
            <p>
              NNVP is in active development. While most features work well,
              not all Keras layer parameters are implemented yet, and you may experience occasional glitches.
            </p>
            <p class="note">
              Future improvements include refactoring, additional features, and enhanced educational capabilities.
            </p>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
export default {
  name: 'AboutModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
  },
  methods: {
    closeModal() {
      this.$emit('close');
    },
    handleEscape(event) {
      if (event.key === 'Escape' && this.show) {
        this.closeModal();
      }
    },
  },
  mounted() {
    document.addEventListener('keydown', this.handleEscape);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: transparent;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding-top: 40px;
}

.modal-container {
  background: #ffffff;
  border-radius: 15px;
  border: 1px solid #000000;
  max-width: 480px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: none;
  position: relative;
  padding: 32px;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 32px;
  line-height: 1;
  color: #000000;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.modal-close:hover {
  opacity: 0.6;
}

.modal-close:focus {
  outline: none;
}

.modal-content {
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  color: #000000;
  line-height: 1.6;
  text-align: left;
}

.modal-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 2em;
  margin: 0 0 6px 0;
  color: #000000;
  text-align: left;
}

.subtitle {
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  font-size: 1em;
  color: #000000;
  margin: 0 0 24px 0;
  text-align: left;
}

.modal-content h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.2em;
  margin: 24px 0 12px 0;
  color: #000000;
  border-bottom: 1px solid #000000;
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
  color: #000000;
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
  border-bottom: 1px solid #e0e0e0;
}

.tech-stack li:last-child {
  border-bottom: none;
}

.tech-stack strong {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  color: #000000;
}

.note {
  font-size: 0.95em;
  color: #000000;
  font-style: italic;
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.4s ease-out;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.4s ease-out;
}

.modal-enter-from .modal-container {
  transform: translateY(-100vh);
}

.modal-leave-to .modal-container {
  transform: translateY(-100vh);
}

/* Scrollbar styling */
.modal-container::-webkit-scrollbar {
  width: 8px;
}

.modal-container::-webkit-scrollbar-track {
  background: #f5f5f5;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb {
  background: #000000;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb:hover {
  opacity: 0.7;
}
</style>
