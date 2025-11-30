<template>
  <div id="canvas-background" class="canvas-background">
    <WhiteBoard :isTraining="isTraining"/>
  </div>
  <div id="generalMenu" class="floating-panel general-menu"><GeneralMenu @open-trainer="openTrainer" @open-about="openAboutModal"/></div>
  <div id="layerCatalog" class="floating-panel layer-catalog"><LayerCatalog/></div>
  <div id="layerOptions" class="floating-panel layer-options"><LayerOptions msg="NNVP"/></div>
  <div id="trainingZone" class="floating-panel training-zone" v-if="trainerHeight > 0" v-bind:style="{height: trainerHeight+'vh'}">
    <TrainingZone @close-trainer="closeTrainer" :trainingZoneSize="trainerHeight" @training-started="isTraining = true" @training-stopped="isTraining = false"/>
  </div>
  <AboutModal :show="showAboutModal" @close="closeAboutModal"/>
</template>


<script>
import GeneralMenu from './components/GeneralMenu.vue';
import LayerCatalog from './components/LayerCatalog/LayerCatalog.vue';
import LayerOptions from './components/LayerOptions/LayerOptions.vue';
import WhiteBoard from './components/WhiteBoard.vue';
import TrainingZone from './components/TrainingZone/TrainingZone.vue';
import AboutModal from './components/AboutModal.vue';

export default {
  name: 'app',
  components: {
    GeneralMenu,
    LayerCatalog,
    LayerOptions,
    WhiteBoard,
    TrainingZone,
    AboutModal,
  },
  methods: {
    openTrainer() {
      this.trainerOpenHeight = this.trainerOpenHeight > 25 ? this.trainerOpenHeight : 25;
      this.trainerHeight = this.trainerOpenHeight;
    },
    closeTrainer() {
      this.trainerHeight = 0;
    },
    openAboutModal() {
      this.showAboutModal = true;
    },
    closeAboutModal() {
      this.showAboutModal = false;
    },
  },
  data() {
    return {
      trainerHeight: 0,
      trainerOpenHeight: 50,
      showAboutModal: false,
      isTraining: false,
    };
  },
  mounted() {
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // eslint-disable-next-line no-alert
      alert('Mobile browser detected. This site is still not fully compatible with touchscreens.\n'
          + 'We recommend to use a desktop browser.');
    }
  },
};
</script>

<style>
/* Inter Variable Font 4.1 - modern, readable font for technical interfaces */
@font-face {
  font-family: "Inter";
  src: url("./assets/fonts/InterVariable.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("./assets/fonts/InterVariable-Italic.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

:root {
  /* Modern font stack with Inter */
  --font-regular: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-medium: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* New design system colors */
  --bg-canvas: #f0f0f0;
  --bg-panel: #ffffff;
  --border-color: #000000;
  --border-width: 1px;
  --border-radius: 15px;
  --panel-margin: 12px;
}

body,html {
  position: fixed; /* disable scroll bounce effect for Safari */
  margin: 0;
  padding: 0;
  overflow: hidden;
}

#app {
  height: 100vh;
  width: 100vw;
  position: relative;
  background-color: var(--bg-canvas);
  user-select: none;
  -webkit-user-select: none;
  max-width: 100%;
  max-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
}

/* Canvas background - full screen underneath panels */
.canvas-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-canvas);
  z-index: 0;
}

/* Floating panels - common styling */
.floating-panel {
  position: absolute;
  background-color: var(--bg-panel);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius);
  overflow: hidden;
  z-index: 10;
  pointer-events: auto;  /* Allow the panel background to receive clicks */
}

/* GeneralMenu - top panel */
.general-menu {
  top: var(--panel-margin);
  left: var(--panel-margin);
  right: var(--panel-margin);
  height: 32px;
  overflow: visible;  /* Allow dropdown menus to show outside the panel */
  z-index: 100;  /* Ensure dropdowns appear above other panels */
}

/* LayerCatalog - left panel */
.layer-catalog {
  top: calc(32px + var(--panel-margin) * 2);
  left: var(--panel-margin);
  bottom: var(--panel-margin);
  width: 220px;
  overflow-y: auto;
}

/* LayerOptions - right panel */
.layer-options {
  top: calc(32px + var(--panel-margin) * 2);
  right: var(--panel-margin);
  bottom: var(--panel-margin);
  width: 240px;
  overflow-y: auto;
}

/* TrainingZone - bottom panel */
.training-zone {
  left: var(--panel-margin);
  right: var(--panel-margin);
  bottom: var(--panel-margin);
  /* height set dynamically via inline style */
}

/* Adjust spacing for buttons/inputs */
button, input[type="button"], input[type="submit"], input, select {
  color: #000000;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  background-color: #FFFFFF;
  border: 1px solid #cccccc;
  border-radius: 4px;
  padding: 4px 8px;
}

input.arrows {
  color: #000000;
  background-color: #FFFFFF;
  border: 1px solid #cccccc;
}

select {
  -webkit-appearance: none;
  appearance: none;
  padding: 4px 8px;
}

select:focus {
  outline: 2px solid #000000;
  outline-offset: 2px;
}

select:-moz-focusring {
  color: transparent;
  text-shadow: 0 0 0 #000000;
}

option:not(:checked) {
  color: black;
}
</style>
