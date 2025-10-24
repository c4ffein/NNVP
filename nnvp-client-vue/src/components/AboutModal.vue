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
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-container {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  padding: 40px;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 32px;
  line-height: 1;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.modal-close:hover {
  color: #333;
}

.modal-content {
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  color: #333;
  line-height: 1.6;
}

.modal-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 2.5em;
  margin: 0 0 8px 0;
  color: #2c3e50;
}

.subtitle {
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  font-size: 1.1em;
  color: #666;
  margin: 0 0 32px 0;
}

.modal-content h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.4em;
  margin: 32px 0 16px 0;
  color: #2c3e50;
}

.modal-content section:first-of-type h2 {
  margin-top: 0;
}

.modal-content p {
  margin: 0 0 16px 0;
}

.modal-content a {
  color: #646cff;
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: color 0.2s;
}

.modal-content a:hover {
  color: #535bf2;
  text-decoration: underline;
}

.tech-stack {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tech-stack li {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.tech-stack li:last-child {
  border-bottom: none;
}

.tech-stack strong {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  color: #2c3e50;
}

.note {
  font-size: 0.95em;
  color: #666;
  font-style: italic;
}

/* Transition animations */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.9);
}

/* Scrollbar styling */
.modal-container::-webkit-scrollbar {
  width: 8px;
}

.modal-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>
