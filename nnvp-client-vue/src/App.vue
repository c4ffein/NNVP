<template>
  <div id="canvas-background" class="canvas-background">
    <WhiteBoard :isTraining="isTraining"/>
  </div>
  <div id="generalMenu" class="floating-panel general-menu"><GeneralMenu @open-trainer="openTrainer" @open-about="openAboutModal" @open-tutorial="startTutorial" @open-account="openAccount"/></div>
  <div id="layerCatalog" class="floating-panel layer-catalog"><LayerCatalog/></div>
  <div id="layerOptions" class="floating-panel layer-options"><LayerOptions msg="NNVP"/></div>
  <div id="trainingZone" class="floating-panel training-zone" v-if="trainerHeight > 0" v-bind:style="{height: trainerHeight+'vh'}">
    <TrainingZone @close-trainer="closeTrainer" :trainingZoneSize="trainerHeight" @training-started="isTraining = true" @training-stopped="isTraining = false"/>
  </div>
  <AboutModal :show="showAboutModal" @close="closeAboutModal"/>
  <AccountPanel :show="showAccount" :intent="accountIntent" @close="closeAccount"/>
  <ChatBubble/>
  <TutorialOverlay :active="tutorialActive" @exit="stopTutorial"/>
</template>


<script>
import GeneralMenu from './components/GeneralMenu.vue';
import LayerCatalog from './components/LayerCatalog/LayerCatalog.vue';
import LayerOptions from './components/LayerOptions/LayerOptions.vue';
import WhiteBoard from './components/WhiteBoard.vue';
import TrainingZone from './components/TrainingZone/TrainingZone.vue';
import AboutModal from './components/AboutModal.vue';
import AccountPanel from './components/Account/AccountPanel.vue';
import ChatBubble from './components/Assistant/ChatBubble.vue';
import TutorialOverlay from './components/Tutorial/TutorialOverlay.vue';

export default {
  name: 'app',
  components: {
    GeneralMenu,
    LayerCatalog,
    LayerOptions,
    WhiteBoard,
    TrainingZone,
    AboutModal,
    AccountPanel,
    ChatBubble,
    TutorialOverlay,
  },
  methods: {
    openAccount(intent) {
      this.accountIntent = typeof intent === 'string' ? intent : '';
      this.showAccount = true;
    },
    closeAccount() {
      this.showAccount = false;
      this.accountIntent = '';
    },
    startTutorial() {
      this.tutorialActive = true;
    },
    stopTutorial() {
      this.tutorialActive = false;
    },
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
      showAccount: false,
      accountIntent: '',
      isTraining: false,
      tutorialActive: false,
    };
  },
  created() {
    // Re-apply a previously chosen theme. When nothing is stored we leave
    // data-theme unset so the prefers-color-scheme media query decides.
    try {
      const saved = localStorage.getItem('nnvp-theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.dataset.theme = saved;
      }
    } catch { /* localStorage unavailable (private mode / SSR) */ }
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

  /* Panel elevation (v0.1): a subtle border + soft shadow instead of a hard
     pure-black hairline, for a lighter, more modern feel. */
  --panel-border: #e5e7eb;
  --panel-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

  /* Semantic tokens (v0.1) - themeable surfaces, text, inputs and accents.
     Components reference these instead of hardcoded #000/#fff/#ccc so the
     whole UI can be re-skinned for dark mode from one place. */
  --bg-elevated: #f9f9f9;                /* dropdowns, settings popovers */
  --bg-input: #ffffff;                   /* text fields, selects */
  --bg-hover: rgba(0, 0, 0, 0.06);       /* subtle hover wash */

  --text-primary: #111827;               /* body copy, headings */
  --text-muted: #6b7280;                 /* secondary / helper text */
  --text-on-fill: #ffffff;               /* text over a solid fill */

  --input-border: #cccccc;               /* form control hairline */

  --accent: #2563eb;                     /* primary / focus color */
  --accent-hover: #1d4ed8;
  --accent-text: #ffffff;                /* text over --accent */
  --success: #16a34a;

  /* Solid "inverted" fill (dark button on light, light button on dark). */
  --fill-strong: #111827;
  --fill-strong-text: #ffffff;

  /* D3 editing canvas (whiteboard) tokens. The SVG board, grid/borders,
     nodes and edges reference these so the theme toggle re-skins the canvas
     from one place. Light values reproduce the historical hardcoded look. */
  --canvas-bg: #f0f0f0;                  /* area around the board + borders */
  --canvas-board: #ffffff;               /* the whiteboard sheet itself */
  --canvas-selection: lightgray;         /* rubber-band selection rect */
  --node-fill: #ffffff;                  /* layer node background */
  --node-stroke: #000000;                /* layer node / anchor outline */
  --node-text: #000000;                  /* layer node label */
  --node-selected-fill: rgb(250, 232, 255); /* selected layer background */
  --node-isolated-stroke: red;           /* isolated / invalid layer outline */
  --edge-color: #333333;                 /* connections + arrow heads */
  --edge-selected: green;                /* selected connection */
  --edge-error: red;                     /* error / cycle connection */
}

/* Dark palette - applied automatically when the OS prefers dark, unless the
   user has made an explicit choice via [data-theme] (handled below). */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-canvas: #0f1115;
    --bg-panel: #1a1d24;
    --border-color: #3a3f4b;
    --panel-border: #2a2f3a;
    --panel-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);

    --bg-elevated: #22262f;
    --bg-input: #12151b;
    --bg-hover: rgba(255, 255, 255, 0.08);

    --text-primary: #e5e7eb;
    --text-muted: #9ca3af;
    --text-on-fill: #ffffff;

    --input-border: #3a3f4b;

    --accent: #3b82f6;
    --accent-hover: #60a5fa;
    --accent-text: #0b1120;
    --success: #22c55e;

    --fill-strong: #e5e7eb;
    --fill-strong-text: #0f1115;

    --canvas-bg: #0f1115;
    --canvas-board: #181b22;
    --canvas-selection: rgba(148, 163, 184, 0.35);
    --node-fill: #22262f;
    --node-stroke: #9aa4b2;
    --node-text: #e5e7eb;
    --node-selected-fill: #3b2b4d;
    --node-isolated-stroke: #f87171;
    --edge-color: #cbd5e1;
    --edge-selected: #4ade80;
    --edge-error: #f87171;
  }
}

/* Explicit user override. Higher specificity than the bare :root above, and
   declared after the media query, so a forced theme always wins. */
:root[data-theme="light"] {
  --bg-canvas: #f0f0f0;
  --bg-panel: #ffffff;
  --border-color: #000000;
  --panel-border: #e5e7eb;
  --panel-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

  --bg-elevated: #f9f9f9;
  --bg-input: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.06);

  --text-primary: #111827;
  --text-muted: #6b7280;
  --text-on-fill: #ffffff;

  --input-border: #cccccc;

  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-text: #ffffff;
  --success: #16a34a;

  --fill-strong: #111827;
  --fill-strong-text: #ffffff;

  --canvas-bg: #f0f0f0;
  --canvas-board: #ffffff;
  --canvas-selection: lightgray;
  --node-fill: #ffffff;
  --node-stroke: #000000;
  --node-text: #000000;
  --node-selected-fill: rgb(250, 232, 255);
  --node-isolated-stroke: red;
  --edge-color: #333333;
  --edge-selected: green;
  --edge-error: red;
}

:root[data-theme="dark"] {
  --bg-canvas: #0f1115;
  --bg-panel: #1a1d24;
  --border-color: #3a3f4b;
  --panel-border: #2a2f3a;
  --panel-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);

  --bg-elevated: #22262f;
  --bg-input: #12151b;
  --bg-hover: rgba(255, 255, 255, 0.08);

  --text-primary: #e5e7eb;
  --text-muted: #9ca3af;
  --text-on-fill: #ffffff;

  --input-border: #3a3f4b;

  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-text: #0b1120;
  --success: #22c55e;

  --fill-strong: #e5e7eb;
  --fill-strong-text: #0f1115;

  --canvas-bg: #0f1115;
  --canvas-board: #181b22;
  --canvas-selection: rgba(148, 163, 184, 0.35);
  --node-fill: #22262f;
  --node-stroke: #9aa4b2;
  --node-text: #e5e7eb;
  --node-selected-fill: #3b2b4d;
  --node-isolated-stroke: #f87171;
  --edge-color: #cbd5e1;
  --edge-selected: #4ade80;
  --edge-error: #f87171;
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
  border: var(--border-width) solid var(--panel-border);
  border-radius: var(--border-radius);
  box-shadow: var(--panel-shadow);
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
  color: var(--text-primary);
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  background-color: var(--bg-input);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  padding: 4px 8px;
}

input.arrows {
  color: var(--text-primary);
  background-color: var(--bg-input);
  border: 1px solid var(--input-border);
}

select {
  -webkit-appearance: none;
  appearance: none;
  padding: 4px 8px;
}

select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

select:-moz-focusring {
  color: transparent;
  text-shadow: 0 0 0 var(--text-primary);
}

option:not(:checked) {
  color: var(--text-primary);
}
</style>
