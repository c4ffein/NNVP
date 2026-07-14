<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div
        ref="container"
        class="modal-surface modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabindex="-1"
        @click.stop
      >
        <button class="modal-close" @click="closeModal" aria-label="Close">&times;</button>

        <div class="modal-content">
          <h1 id="settings-modal-title">Settings</h1>
          <p class="subtitle">Stored on this device</p>

          <section>
            <h2>Activation colors</h2>
            <p>
              The color ramp used wherever activations are shown — the inspect
              overlays on the board and the 3D view. Viridis is the
              colorblind-safe choice.
            </p>
            <label v-for="scheme in schemes" :key="scheme.id" class="settings-scheme">
              <input
                type="radio"
                name="colorScheme"
                :value="scheme.id"
                :checked="scheme.id === colorScheme"
                @change="setColorScheme(scheme.id)"
              />
              <span class="settings-scheme-body">
                <span class="settings-scheme-label">{{ scheme.label }}</span>
                <span class="settings-scheme-swatch" :style="{ background: gradientOf(scheme) }"></span>
                <span class="settings-scheme-description">{{ scheme.description }}</span>
              </span>
            </label>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
import { COLOR_SCHEMES, rampGradientCss } from '../lib/Settings/colorSchemes';
import { settings } from '../lib/Settings/settings';

export default {
  name: 'SettingsModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
  },
  data() {
    return {
      schemes: Object.values(COLOR_SCHEMES),
      colorScheme: settings.get('colorScheme'),
    };
  },
  watch: {
    show(isOpen) {
      if (isOpen) this.onOpen();
      else this.restoreFocus();
    },
  },
  methods: {
    closeModal() {
      this.$emit('close');
    },
    setColorScheme(id) {
      settings.set('colorScheme', id);
      this.colorScheme = id;
    },
    gradientOf(scheme) {
      return rampGradientCss(scheme);
    },
    onOpen() {
      this.colorScheme = settings.get('colorScheme');
      this.previouslyFocused = document.activeElement;
      this.$nextTick(() => {
        const container = this.$refs.container;
        if (!container) return;
        const focusable = container.querySelector('input, button');
        (focusable || container).focus();
      });
    },
    restoreFocus() {
      if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
        this.previouslyFocused.focus();
      }
      this.previouslyFocused = null;
    },
  },
};
</script>

<style scoped>
.settings-scheme {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
}
.settings-scheme input {
  margin-top: 3px;
}
.settings-scheme-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.settings-scheme-label {
  font-weight: var(--font-weight-semibold);
}
.settings-scheme-swatch {
  display: block;
  width: 180px;
  height: 10px;
  border-radius: 5px;
  border: 1px solid var(--panel-border);
}
.settings-scheme-description {
  color: var(--text-muted);
  font-size: 12px;
}
</style>
