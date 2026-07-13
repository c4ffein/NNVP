<template>
  <div class="ParamsBlock">
    <div
      class="ParamsBlock layer-title"
      role="button"
      tabindex="0"
      :aria-expanded="!isClosed"
      :aria-label="'Toggle ' + title + ' parameters'"
      @click="toggleLayer()"
      @keydown.enter.prevent="toggleLayer()"
      @keydown.space.prevent="toggleLayer()"
    >
      {{title}}
      <div class="layer-title-actions">
        <button
          v-if="layerType"
          type="button"
          class="help-icon"
          :aria-label="'Learn about the ' + layerType + ' layer'"
          @click.stop="openModal"
        >?</button>
        <div class="arrow" aria-hidden="true">▲</div>
      </div>
    </div>
    <div class="ParamsBlock params-list" v-bind:class="{ closed: isClosed}">
      <slot></slot>
    </div>

    <!-- Help Modal -->
    <Teleport to="body">
      <Transition name="modal">
      <div v-if="showModal" class="layer-help-modal-overlay" @click="closeModal">
        <div
          class="layer-help-modal-container"
          role="dialog"
          aria-modal="true"
          :aria-label="layerType + ' layer help'"
          @click.stop
        >
          <button class="layer-help-modal-close" aria-label="Close" @click="closeModal">&times;</button>
          <div class="layer-help-modal-body">
            <div v-html="getLayerHelp()"></div>
          </div>
          <div v-if="backendEnabled" class="layer-help-ask-row">
            <button type="button" class="layer-help-ask" @click="askInChat">
              💬 Ask the assistant about {{ layerType }}
            </button>
          </div>
        </div>
      </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import layerHelp from '../../lib/KerasInterface/layerHelp';
import { askAssistant } from '../../lib/Assistant/askAssistant';

export default {
  name: 'ParamsBlock',
  props: {
    title: String,
    layerType: String, // The Keras layer type (e.g., 'Dense', 'Conv2D', etc.)
  },
  data() {
    return {
      isClosed: false,
      showModal: false,
      // Same gate as App.vue's ChatBubble mount: no chat, no handoff button.
      backendEnabled: !!import.meta.env.VITE_ENABLE_BACKEND,
    };
  },
  methods: {
    toggleLayer() {
      this.isClosed = !this.isClosed;
    },
    openModal() {
      this.showModal = true;
    },
    closeModal() {
      this.showModal = false;
    },
    askInChat() {
      askAssistant(this.layerType);
      this.closeModal();
    },
    handleEscape(event) {
      if (event.key === 'Escape' && this.showModal) {
        this.closeModal();
      }
    },
    getLayerHelp() {
      return layerHelp[this.layerType] || `
        <h2>${this.layerType}</h2>
        <p>This is a ${this.layerType} layer. Documentation coming soon!</p>
        <p>Check the <a href="https://keras.io/api/layers/" target="_blank">Keras documentation</a> for more details.</p>
      `;
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

<style >
.ParamsBlock {
  height: 100%;
  box-sizing: border-box;
  -moz-box-sizing: border-box;
  -webkit-box-sizing: border-box;
  margin-bottom: 12px;
}
.ParamsBlock > h4 {
  display: inline-block;
}
.ParamsBlock.layer-title {
  background-color: transparent;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 15px;
  cursor: pointer;
  padding: 10px 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  transition: all 0.15s ease;
}
.ParamsBlock > .layer-title > .arrow {
  color: var(--text-primary);
  height: 15px;
  width: 15px;
  transform: rotate(180deg);
  vertical-align: middle;
  text-align: center;
  font-size: 10px;
  transition: transform 0.2s ease;
}
.ParamsBlock.closed > .layer-title > .arrow {
  transform: rotate(90deg);
}
.ParamsBlock.params-list {
  padding: 12px 4px;
  color: var(--text-primary);
}
.ParamsBlock.params-list.closed {
  height: 0;
  overflow: hidden;
  padding: 0;
}

/* Help button and actions */
.layer-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--fill-strong);
  color: var(--fill-strong-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.help-icon:hover {
  opacity: 0.85;
  transform: scale(1.1);
}

.help-icon:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.ParamsBlock.layer-title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Modal styling - matching CompileOptions theme */
.layer-help-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--modal-scrim);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 10000;
  padding-top: 40px;
}

.layer-help-modal-container {
  /* Same chrome as every panel/window: hairline border + soft shadow. */
  background: var(--bg-panel);
  border-radius: var(--border-radius);
  border: var(--border-width) solid var(--panel-border);
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--panel-shadow);
  position: relative;
  padding: 32px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
  line-height: 1.6;
  text-align: left;
}

/* Same round close button as the window titlebars. */
.layer-help-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--panel-border);
  background-color: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.layer-help-modal-close:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

/* Footer handoff to the chat widget (both help modals share this family). */
.layer-help-ask-row {
  border-top: 1px solid var(--panel-border);
  margin-top: 16px;
  padding-top: 14px;
  display: flex;
  justify-content: center;
}
.layer-help-ask {
  cursor: pointer;
  font-size: 13px;
}

.layer-help-modal-body h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 24px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.layer-help-modal-body h3 {
  margin-top: 20px;
  margin-bottom: 12px;
  font-size: 18px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.layer-help-modal-body p {
  margin-bottom: 12px;
}

.layer-help-modal-body ul,
.layer-help-modal-body ol {
  margin-bottom: 12px;
  padding-left: 24px;
}

.layer-help-modal-body li {
  margin-bottom: 8px;
}

.layer-help-modal-body em {
  display: block;
  margin-top: 16px;
  font-style: italic;
  color: var(--text-muted);
}

.layer-help-modal-body a {
  color: var(--accent);
  text-decoration: underline;
}

.layer-help-modal-body a:hover {
  color: var(--accent-hover);
}
</style>
