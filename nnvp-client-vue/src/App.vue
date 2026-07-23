<template>
  <div id="canvas-background" class="canvas-background">
    <FlowBoard :isTraining="isTraining"/>
  </div>
  <div id="generalMenu" class="floating-panel general-menu"><GeneralMenu @open-trainer="openTrainer" @open-tutorial="openTutorialMenu" @open-account="openAccount" @open-save-load="openSaveLoad" :views="{ left: showLeftPanel, right: showRightPanel, training: trainerHeight > 0, chat: backendEnabled && showChat, chatAvailable: backendEnabled }" @toggle-view="togglePanel"/><CornerControls @open-account="openAccount()" @open-settings="openAccount('settings')" @open-about="showAboutModal = true" @open-viz3d="showViz3D = !showViz3D"/></div>
  <FloatingWindow
    id="layerCatalog"
    v-show="showLeftPanel"
    window-id="catalog"
    title="Layers"
    :initial="windowRects.catalog"
    :min-width="220"
    :min-height="300"
    @close="togglePanel('showLeftPanel')"
  ><LayerCatalog/></FloatingWindow>
  <FloatingWindow
    id="layerOptions"
    v-show="showRightPanel"
    window-id="options"
    title="Layer options"
    :initial="windowRects.options"
    :min-width="240"
    :min-height="300"
    @close="togglePanel('showRightPanel')"
  ><LayerOptions msg="NNVP"/></FloatingWindow>
  <FloatingWindow
    id="trainingZone"
    v-if="trainerHeight > 0"
    window-id="training"
    title="Training"
    :initial="windowRects.training"
    :min-width="300"
    :min-height="280"
    @close="closeTrainer"
  >
    <TrainingZone @close-trainer="closeTrainer" :trainingZoneSize="trainerHeight" @training-started="isTraining = true" @training-stopped="isTraining = false"/>
  </FloatingWindow>
  <Viz3DWindow v-if="showViz3D" @close="showViz3D = false" @open-settings="openAccount('settings')"/>
  <AboutModal :show="showAboutModal" @close="showAboutModal = false" @open-tutorials="openTutorialsFromAbout"/>
  <TutorialMenu :show="showTutorialMenu" @close="showTutorialMenu = false" @start="startTutorial"/>
  <!-- Always rendered: without a backend build it still hosts the
       device-local Settings tab. -->
  <AccountPanel :show="showAccount" :intent="accountIntent" @close="closeAccount" @pending-login="openAccount()"/>
  <SaveLoadModal v-if="backendEnabled" :show="showSaveLoad" :mode="saveLoadMode" @close="showSaveLoad = false" @open-account="openAccount()"/>
  <ChatBubble v-if="backendEnabled && showChat" @open-account="openAccount($event)" @close="togglePanel('showChat')"/>
  <TutorialOverlay :active="tutorialActive" :tutorial="activeTutorial" @exit="stopTutorial" @open-menu="openMenuFromTutorial"/>
</template>


<script lang="ts">
import { defineComponent } from 'vue';
import GeneralMenu from './components/GeneralMenu.vue';
import LayerCatalog from './components/LayerCatalog/LayerCatalog.vue';
import LayerOptions from './components/LayerOptions/LayerOptions.vue';
import FlowBoard from './components/FlowBoard/FlowBoard.vue';
import TrainingZone from './components/TrainingZone/TrainingZone.vue';
import AboutModal from './components/AboutModal.vue';
import AccountPanel from './components/Account/AccountPanel.vue';
import SaveLoadModal from './components/SaveLoad/SaveLoadModal.vue';
import CornerControls from './components/CornerControls.vue';
import FloatingWindow from './components/FloatingWindow.vue';
import Viz3DWindow from './components/Viz3D/Viz3DWindow.vue';
import ChatBubble from './components/Assistant/ChatBubble.vue';
import TutorialOverlay from './components/Tutorial/TutorialOverlay.vue';
import TutorialMenu from './components/Tutorial/TutorialMenu.vue';
import { getTutorial } from './lib/Tutorial/tutorials';
import type { TutorialDef } from './lib/Tutorial/tutorials';
import { ASK_EVENT } from './lib/Assistant/askAssistant';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

// The panel flags togglePanel flips (the training zone is handled apart).
type PanelKey = 'showLeftPanel' | 'showRightPanel' | 'showChat';

// Non-reactive instance fields assigned outside data() (pure typing pass:
// keeping them out of data() preserves their non-reactive nature).
interface AppInstanceExtra {
  onStartTutorial?: (event: Event) => void;
  onAskAssistant?: () => void;
  onOpenTraining?: () => void;
}

// Panel visibility survives reloads. Anything but an explicit '0' means
// shown, except panels that default to hidden (the chat) which need an
// explicit '1'.
function readPanelPref(side: string, shownByDefault = true): boolean {
  try {
    const stored = localStorage.getItem(`nnvp-panel-${side}`);
    if (stored === null) return shownByDefault;
    return stored !== '0';
  } catch {
    return shownByDefault;
  }
}

export default defineComponent({
  name: 'app',
  components: {
    GeneralMenu,
    LayerCatalog,
    LayerOptions,
    FlowBoard,
    TrainingZone,
    AboutModal,
    AccountPanel,
    SaveLoadModal,
    CornerControls,
    FloatingWindow,
    Viz3DWindow,
    ChatBubble,
    TutorialOverlay,
    TutorialMenu,
  },
  methods: {
    openAccount(intent?: unknown) {
      this.accountIntent = typeof intent === 'string' ? intent : '';
      this.showAccount = true;
    },
    closeAccount() {
      this.showAccount = false;
      this.accountIntent = '';
    },
    openSaveLoad(mode?: unknown) {
      this.saveLoadMode = mode === 'save' ? 'save' : 'load';
      this.showSaveLoad = true;
    },
    openTutorialMenu() {
      this.showTutorialMenu = true;
    },
    openTutorialsFromAbout() {
      this.showAboutModal = false;
      this.showTutorialMenu = true;
    },
    openMenuFromTutorial() {
      this.stopTutorial();
      this.showTutorialMenu = true;
    },
    startTutorial(tutorialId: string) {
      this.activeTutorial = getTutorial(tutorialId) || null;
      this.showTutorialMenu = false;
      this.tutorialActive = this.activeTutorial !== null;
    },
    stopTutorial() {
      this.tutorialActive = false;
      this.activeTutorial = null;
    },
    openTrainer() {
      this.trainerOpenHeight = this.trainerOpenHeight > 25 ? this.trainerOpenHeight : 25;
      this.trainerHeight = this.trainerOpenHeight;
    },
    closeTrainer() {
      this.trainerHeight = 0;
    },
    togglePanel(key: PanelKey | 'training') {
      // The training zone is not a boolean flag but a height; toggling it
      // from the View menu maps onto the existing open/close methods.
      if (key === 'training') {
        if (this.trainerHeight > 0) this.closeTrainer();
        else this.openTrainer();
        return;
      }
      this[key] = !this[key];
      try {
        const side = { showLeftPanel: 'left', showRightPanel: 'right', showChat: 'chat' }[key];
        localStorage.setItem(`nnvp-panel-${side}`, this[key] ? '1' : '0');
      } catch { /* localStorage unavailable */ }
    },
  },
  data() {
    return {
      // Cloud accounts are disabled in builds without VITE_ENABLE_BACKEND
      // (a static-only deploy has no /api to talk to). GeneralMenu hides the
      // matching menu entries.
      backendEnabled: !!(import.meta as ImportMetaWithEnv).env?.VITE_ENABLE_BACKEND,
      showLeftPanel: readPanelPref('left'),
      showRightPanel: readPanelPref('right'),
      showChat: readPanelPref('chat', false),
      trainerHeight: 0,
      trainerOpenHeight: 50,
      showAboutModal: false,
      showAccount: false,
      accountIntent: '',
      showSaveLoad: false,
      saveLoadMode: 'load',
      showViz3D: false,
      isTraining: false,
      // Each window opens where its fixed panel used to live (56 = menu
      // height + margins); computed once at startup from the viewport.
      windowRects: {
        catalog: {
          x: 12, y: 56, width: 220, height: window.innerHeight - 68,
        },
        options: {
          x: window.innerWidth - 252, y: 56, width: 240, height: window.innerHeight - 68,
        },
        training: {
          x: 12,
          y: window.innerHeight - 12 - Math.round(window.innerHeight * 0.5),
          width: window.innerWidth - 24,
          height: Math.round(window.innerHeight * 0.5),
        },
      },
      tutorialActive: false,
      activeTutorial: null as TutorialDef | null,
      showTutorialMenu: false,
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
    // A magic sign-in link landed here (/?magic=<token>): the account panel
    // verifies it and strips the token from the URL.
    if (this.backendEnabled && new URLSearchParams(window.location.search).get('magic')) {
      this.openAccount('magic');
    }
    const self = this as unknown as AppInstanceExtra;
    // The assistant starts/switches tutorials through this event
    // (assistantActions.startTutorial) — same bridge pattern as auth changes.
    self.onStartTutorial = (event: Event) => {
      const { detail } = event as CustomEvent<{ id?: string }>;
      if (detail && detail.id) this.startTutorial(detail.id);
    };
    window.addEventListener('nnvp:start-tutorial', self.onStartTutorial);
    // "Ask the assistant" from a help modal must work when the chat widget is
    // hidden via the View menu: mount it, and ChatBubble consumes the pending
    // ask on mount (see lib/Assistant/askAssistant.js).
    self.onAskAssistant = () => {
      if (this.backendEnabled && !this.showChat) this.togglePanel('showChat');
    };
    window.addEventListener(ASK_EVENT, self.onAskAssistant);
    // The assistant opens the Training panel through this event
    // (assistantActions.openTrainingPanel).
    self.onOpenTraining = () => this.openTrainer();
    window.addEventListener('nnvp:open-training', self.onOpenTraining);
  },
  beforeUnmount() {
    const self = this as unknown as AppInstanceExtra;
    window.removeEventListener('nnvp:start-tutorial', self.onStartTutorial!);
    window.removeEventListener(ASK_EVENT, self.onAskAssistant!);
    window.removeEventListener('nnvp:open-training', self.onOpenTraining!);
  },
});
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
  --modal-scrim: rgba(17, 24, 39, 0.4);   /* dimmer behind blocker modals */

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

  --accent: #5566ee;                     /* primary / focus color */
  --accent-hover: #4152d9;
  --accent-text: #ffffff;                /* text over --accent */
  --success: #16a34a;

  /* Solid "inverted" fill (dark button on light, light button on dark). */
  --fill-strong: #111827;
  --fill-strong-text: #ffffff;

  /* Editing canvas (FlowBoard) tokens. The board, nodes and edges reference
     these so the theme toggle re-skins the canvas from one place. Light
     values reproduce the historical hardcoded look. */
  --canvas-board: #ffffff;               /* the board sheet itself */
  --node-fill: #ffffff;                  /* layer node background */
  --node-stroke: #000000;                /* layer node / anchor outline */
  --node-text: #000000;                  /* layer node label */
  --node-selected-fill: rgb(250, 232, 255); /* selected layer background */
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
    --modal-scrim: rgba(0, 0, 0, 0.6);

    --bg-elevated: #22262f;
    --bg-input: #12151b;
    --bg-hover: rgba(255, 255, 255, 0.08);

    --text-primary: #e5e7eb;
    --text-muted: #9ca3af;
    --text-on-fill: #ffffff;

    --input-border: #3a3f4b;

    --accent: #5566ee;
    --accent-hover: #7280f2;
    --accent-text: #ffffff;
    --success: #22c55e;

    --fill-strong: #e5e7eb;
    --fill-strong-text: #0f1115;

    --canvas-board: #181b22;
    --node-fill: #22262f;
    --node-stroke: #9aa4b2;
    --node-text: #e5e7eb;
    --node-selected-fill: #3b2b4d;
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
  --modal-scrim: rgba(17, 24, 39, 0.4);   /* dimmer behind blocker modals */

  --bg-elevated: #f9f9f9;
  --bg-input: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.06);

  --text-primary: #111827;
  --text-muted: #6b7280;
  --text-on-fill: #ffffff;

  --input-border: #cccccc;

  --accent: #5566ee;
  --accent-hover: #4152d9;
  --accent-text: #ffffff;
  --success: #16a34a;

  --fill-strong: #111827;
  --fill-strong-text: #ffffff;

  --canvas-board: #ffffff;
  --node-fill: #ffffff;
  --node-stroke: #000000;
  --node-text: #000000;
  --node-selected-fill: rgb(250, 232, 255);
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
  --modal-scrim: rgba(0, 0, 0, 0.6);

  --bg-elevated: #22262f;
  --bg-input: #12151b;
  --bg-hover: rgba(255, 255, 255, 0.08);

  --text-primary: #e5e7eb;
  --text-muted: #9ca3af;
  --text-on-fill: #ffffff;

  --input-border: #3a3f4b;

  --accent: #5566ee;
  --accent-hover: #7280f2;
  --accent-text: #ffffff;
  --success: #22c55e;

  --fill-strong: #e5e7eb;
  --fill-strong-text: #0f1115;

  --canvas-board: #181b22;
  --node-fill: #22262f;
  --node-stroke: #9aa4b2;
  --node-text: #e5e7eb;
  --node-selected-fill: #3b2b4d;
  --edge-color: #cbd5e1;
  --edge-selected: #4ade80;
  --edge-error: #f87171;
}

body,html {
  position: fixed; /* disable scroll bounce effect for Safari */
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* Never bounce the page itself, and paint the root the canvas color so
     anything the browser DOES reveal during elastic overscroll is themed
     instead of the default (white/transparent) document background. */
  overscroll-behavior: none;
  background-color: var(--bg-canvas);
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
/* Shared modal chrome. Every dialog (About, Cloud/Account, Tutorial menu, …)
   uses these three classes for its overlay / surface / close button, so the
   theme skins all of them from this one place; components keep only their own
   sizing and content styles (and their legacy class names for the tests). */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--modal-scrim);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding-top: 40px;
}
.modal-surface {
  background-color: var(--bg-panel);
  border-radius: var(--border-radius);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  /* Reaching the top/bottom must not chain the scroll to what's behind the
     dialog (the same containment #training-zone-selector uses). */
  overscroll-behavior: contain;
  position: relative;
  color: var(--text-primary);
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  text-align: left;
}
.modal-close {
  position: absolute;
  top: 14px;
  right: 16px;
  background: none;
  border: none;
  font-size: 30px;
  line-height: 1;
  color: var(--text-primary);
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}
.modal-close:hover { opacity: 0.6; }
.modal-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

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

/* GeneralMenu - top bar: a centered pill sized to its content (menu entries
   + the theme/account icons at its right end). */
.general-menu {
  top: var(--panel-margin);
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
  max-width: calc(100% - var(--panel-margin) * 2);
  height: 32px;
  display: flex;
  align-items: stretch;
  overflow: visible;  /* Allow dropdown menus to show outside the panel */
  z-index: 500;  /* Above the raisable window stack (see lib/windowing.js) */
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

/* Whole-screen blocker modals: the scrim fades in while the card slides down
   from the top. Shared by every <Transition name="modal"> (About, Account,
   tutorial menu, help modals) — components must not redefine these classes. */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.35s ease-out;
}
.modal-enter-active > *,
.modal-leave-active > * {
  transition: transform 0.35s ease-out;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > *,
.modal-leave-to > * {
  transform: translateY(-100vh);
}
</style>
