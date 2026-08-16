/**
 * Component-backed world helpers for BUN mode: mount REAL SFCs (via
 * tests/harness/vue-loader.ts + @vue/test-utils + happy-dom) and drive them
 * the way the app would. The browser world implements the same helper surface
 * by clicking the real UI.
 *
 * Components read auth from localStorage and talk HTTP through fetch, so the
 * helpers control those two boundaries — nothing inside the components is
 * faked.
 */
import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ChatBubble from '../../src/components/Assistant/ChatBubble.vue';
import LayerCatalog from '../../src/components/LayerCatalog/LayerCatalog.vue';
import FloatingWindow from '../../src/components/FloatingWindow.vue';
import Charts from '../../src/components/TrainingZone/Charts.vue';
import TrainingZone from '../../src/components/TrainingZone/TrainingZone.vue';
import ModelsWindow from '../../src/components/Models/ModelsWindow.vue';
import { resetWindowRects } from '../../src/lib/windowing';
import { resetChatSession } from '../../src/lib/Assistant/chatSession';
import { resetTrainingConfig } from '../../src/lib/Training/trainingConfig';
import { askAssistant } from '../../src/lib/Assistant/askAssistant';
import { bus } from '../../src/lib/Events/bus';
import { MemoryRecordStore } from '../../src/lib/LocalStore/recordStore';
import { setRecordStoreForTests } from '../../src/lib/LocalStore/db';
import { createFakeBackend } from './fakeBackend';
import type { FakeBackend } from './fakeBackend';
import type {
  BackendDriver, CatalogDriver, ChartsDriver, ChatDriver, HistoryDriver, ModelsDriver,
  RecordsDriver, TrainingDriver, WindowsDriver, WindowName,
} from './define';

// The mounted-wrapper seam: each driver hosts one arbitrary component, so the
// wrapper's own generic carries no information the drivers use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wrapper = VueWrapper<any>;

/** What the bun drivers add over the suite-facing contract: runner cleanup. */
interface Teardown {
  teardown(): Promise<void>;
}

function stubGlobalProperties() {
  // ChatBubble builds AssistantActions over these; the chat-state helpers
  // never invoke tools, so inert stubs are enough.
  return {
    $boardInterface: { on: () => {}, off: () => {} },
    $kerasInterface: {},
  };
}

// Two generic FloatingWindows; the browser world maps the same contract onto
// the app's real catalog/options windows.
// The training Charts tab; the browser world reaches it through the real
// Panels > Training window.
export function makeChartsDriver(): ChartsDriver & Teardown {
  let wrapper: Wrapper | null = null;
  return {
    async open() {
      wrapper = mount(Charts, { attachTo: document.body });
    },
    async helpText(which) {
      const buttons = wrapper!.findAll('.chart-help');
      await buttons[which === 'batch' ? 0 : 1]!.trigger('click');
      await wrapper!.vm.$nextTick();
      const modal = document.body.querySelector('.layer-help-modal-body');
      const text = modal ? modal.textContent : '';
      const close = document.body.querySelector<HTMLElement>('.layer-help-modal-close');
      if (close) close.click();
      await wrapper!.vm.$nextTick();
      return text;
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

// The Training window's Options tab: mounts the REAL TrainingZone (mounting
// IS opening — App renders it under v-if, so close/reopen is unmount/remount,
// which is exactly what the persistence tests exercise). The browser world
// reaches the same contract through the real Panels > Training window.
/**
 * What TrainingZone reaches on $boardInterface outside of a training run:
 * the Inspect panel's event hooks and the weights import's "fresh model of
 * the board's graph" (getGraphJSON + generated code). Everything else stays
 * inert — these tests never train.
 */
export interface TrainingBoardSeam {
  on(): void;
  off(): void;
  setInspection(): void;
  getGraphJSON(): string;
  generateJavascriptNoSave(kerasInterface: unknown): string | null;
}

const INERT_TRAINING_SEAM: TrainingBoardSeam = {
  on() {},
  off() {},
  setInspection() {},
  getGraphJSON: () => '',
  generateJavascriptNoSave: () => null,
};

export function makeTrainingDriver(boardSeam: TrainingBoardSeam = INERT_TRAINING_SEAM): TrainingDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const optimizerSelect = () => wrapper!.find('.optimizer-section select');
  const epochsInput = () => wrapper!.find('.training-params-section input[type="number"]');
  const mountZone = async (tab: string) => {
    wrapper = mount(TrainingZone, {
      // startTraining is never reached; the seam covers Inspect + weights import
      // (same inert-mock pattern as ChatBubble for the rest).
      global: { mocks: { $boardInterface: boardSeam, $kerasInterface: {} } },
      attachTo: document.body,
    });
    const tabs = wrapper.findAll('.TrainingZone.bar-button');
    await tabs.find(t => t.text() === tab)!.trigger('click');
    await wrapper.vm.$nextTick();
  };
  // Weights import awaits tfjs (prepare on the cpu backend) then crypto
  // digests — real async; poll the rendered outcome instead of guessing turns.
  const waitForStatus = async () => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await flushPromises();
      if (wrapper!.find('[data-testid="weights-status"]').exists()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('weights row never reported an outcome');
  };
  return {
    async open() {
      // Land on the Options tab, where the compile options form lives.
      await mountZone('Options');
    },
    async openInspect() {
      await mountZone('Inspect');
    },
    async weightsRow() {
      const status = wrapper!.find('[data-testid="weights-status"]');
      const hint = wrapper!.find('[data-testid="inspect-no-model-hint"]');
      return {
        downloadEnabled: !(wrapper!.find('[data-testid="weights-download-button"]').element as HTMLButtonElement).disabled,
        loadEnabled: !(wrapper!.find('[data-testid="weights-load-button"]').element as HTMLButtonElement).disabled,
        status: status.exists() ? status.text() : null,
        statusIsError: status.exists() && status.classes().includes('inspect-error'),
        hint: hint.exists() ? hint.text() : null,
      };
    },
    async loadWeightsFile(name, bytes) {
      const input = wrapper!.find('[data-testid="weights-file-input"]');
      const file = new File([bytes as BlobPart], name);
      // A file input's `files` is read-only; the chooser is the one thing a
      // test can't click, so it is set the way the browser would.
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
      await input.trigger('change');
      await waitForStatus();
    },
    async close() {
      wrapper!.unmount();
      wrapper = null;
    },
    async setOptimizer(name) {
      await optimizerSelect().setValue(name);
      await wrapper!.vm.$nextTick();
    },
    async setEpochs(value) {
      await epochsInput().setValue(String(value));
      await wrapper!.vm.$nextTick();
    },
    async optimizer() {
      return (optimizerSelect().element as HTMLSelectElement).value;
    },
    async epochs() {
      return Number((epochsInput().element as HTMLInputElement).value);
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      resetTrainingConfig(); // module state must not leak between tests
    },
  };
}

export function makeWindowsDriver(): WindowsDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const HOST = defineComponent({
    components: { FloatingWindow },
    data: () => ({ aOpen: true, bOpen: true }),
    template: `<div>
      <FloatingWindow v-show="aOpen" class="win-a" title="A"
        :initial="{ x: 50, y: 50, width: 300, height: 250 }"
        :min-width="300" :min-height="250" @close="aOpen = false"><p>a</p></FloatingWindow>
      <FloatingWindow v-show="bOpen" class="win-b" title="B"
        :initial="{ x: 400, y: 50, width: 300, height: 250 }"
        :min-width="300" :min-height="250" @close="bOpen = false"><p>b</p></FloatingWindow>
    </div>`,
  });
  const el = (name: WindowName) => wrapper!.find(name === 'a' ? '.win-a' : '.win-b');
  const firePointer = (type: string, x: number, y: number) => {
    window.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, button: 0 }));
  };
  return {
    async open() {
      wrapper = mount(HOST, { attachTo: document.body });
    },
    async isVisible(name) {
      return el(name).isVisible();
    },
    async close(name) {
      await el(name).find('.floating-window-close').trigger('click');
    },
    async position(name) {
      const { style } = el(name).element as HTMLElement;
      return { x: parseFloat(style.left), y: parseFloat(style.top) };
    },
    async size(name) {
      const { style } = el(name).element as HTMLElement;
      return { width: parseFloat(style.width), height: parseFloat(style.height) };
    },
    async zIndexOf(name) {
      return parseInt((el(name).element as HTMLElement).style.zIndex, 10);
    },
    async raise(name) {
      await el(name).trigger('pointerdown', { clientX: 60, clientY: 60, button: 0 });
    },
    async dragBy(name, dx, dy) {
      await el(name).find('.floating-window-titlebar')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500 + dy);
      firePointer('pointerup', 500 + dx, 500 + dy);
      await wrapper!.vm.$nextTick();
    },
    async dragTo(name, x, y) {
      const { style } = el(name).element as HTMLElement;
      const dx = x - parseFloat(style.left);
      const dy = y - parseFloat(style.top);
      await this.dragBy(name, dx, dy);
    },
    /** Grab the titlebar, then move the POINTER to exact viewport coords. */
    async dragPointerTo(name, x, y) {
      await el(name).find('.floating-window-titlebar')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', x, y);
      firePointer('pointerup', x, y);
      await wrapper!.vm.$nextTick();
    },
    async viewport() {
      return { width: window.innerWidth, height: window.innerHeight };
    },
    async resizeBy(name, dx, dy) {
      await el(name).find('.floating-window-resize')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500 + dy);
      firePointer('pointerup', 500 + dx, 500 + dy);
      await wrapper!.vm.$nextTick();
    },
    async resizeLeftEdgeBy(name, dx) {
      await el(name).find('.fw-edge-w')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500);
      firePointer('pointerup', 500 + dx, 500);
      await wrapper!.vm.$nextTick();
    },
    /** Both host windows use minWidth 300 (style width, no border term). */
    async expectedMinWidth() {
      return 300;
    },
    /** What size() adds over the style width: nothing — it reads style. */
    async borderOverhead() {
      return 0;
    },
    /** The initial (default) rect each host window is mounted with. */
    async defaults(name) {
      return name === 'a'
        ? { width: 300, height: 250 }
        : { width: 300, height: 250 };
    },
    async toggleMaximize(name) {
      await el(name).find('.floating-window-maximize').trigger('click');
      await wrapper!.vm.$nextTick();
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

export function makeCatalogDriver(): CatalogDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const mountCatalog = () => {
    wrapper = mount(LayerCatalog, {
      global: {
        mocks: {
          // The catalog only reads categories and registers callbacks/drag
          // handlers on these; category open/close is pure DOM state.
          $kerasInterface: {
            getCategories: () => ({
              Core: { Dense: { searchTerms: ['Dense'] } },
              Merging: { Add: { searchTerms: ['Add'] } },
            }),
          },
          $boardInterface: {
            setLeftBarRemountCallback: () => {},
            addEventHandlerDragOnHtmlClass: () => {},
          },
        },
      },
      attachTo: document.body,
    });
  };
  return {
    async open() {
      mountCatalog();
    },
    async toggleAll() {
      await wrapper!.find('.collapse-all-button').trigger('click');
    },
    async toggleCategory(name) {
      await wrapper!.find(`[aria-label="Toggle ${name} layers"]`).trigger('click');
    },
    /** True when the master arrow offers "expand all" (fully collapsed). */
    async masterArrowCollapsed() {
      return wrapper!.find('.collapse-all-arrow').classes().includes('collapsed');
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

/**
 * The RecordsDriver under bun: install a FRESH MemoryRecordStore as the app
 * singleton for this test (so every component sees it via getRecordStore),
 * seed/read against it, restore the real singleton on teardown. Suites that
 * still inject their own store afterwards simply win — last set wins.
 */
export function makeRecordsDriver(): RecordsDriver & Teardown {
  const store = new MemoryRecordStore();
  setRecordStoreForTests(store);
  return {
    async seed(name, records) {
      for (const record of records) await store.put(name, record);
    },
    async list(name) {
      return store.list(name);
    },
    async teardown() {
      setRecordStoreForTests(null);
    },
  };
}

/**
 * The BackendDriver under bun: swap globalThis.fetch for the fake /api
 * router. The shim is installed at driver CREATION (world boot), not at
 * serve(): ApiClients bind globalThis.fetch when they are constructed, and
 * the world's own service wiring (installAppServices) constructs one at
 * boot — before any test body runs. Until serve() provides a fake, every
 * request falls through to the real fetch; non-/api requests always do.
 */
export function makeBackendDriver(): BackendDriver & Teardown {
  const originalFetch = globalThis.fetch;
  let fake: FakeBackend | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!fake) return originalFetch(input as RequestInfo, init);
    const url = typeof input === 'string' || input instanceof URL
      ? String(input) : input.url;
    const method = init?.method
      || (input instanceof Request ? input.method : 'GET');
    const body = typeof init?.body === 'string' ? init.body : null;
    const answer = fake.handle(method, url, body);
    if (!answer) return originalFetch(input as RequestInfo, init);
    return new Response(answer.body, {
      status: answer.status,
      headers: answer.body === null ? undefined : { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return {
    async serve(data) {
      fake = createFakeBackend(data);
    },
    async uuids(kind) {
      return fake ? [...fake.state[kind].keys()] : [];
    },
    async teardown() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** What the history driver needs from the board: TrainingZone.restoreRun's
 *  one $boardInterface call. The bun world wires it to the world's editor so
 *  a Restore lands on the same board the suite asserts through. */
export interface HistoryBoardSeam {
  loadGraphFromJSON(json: string): void;
}

/**
 * The Training window's History tab: mounts the REAL TrainingZone (mounting
 * IS opening, the makeTrainingDriver pattern) and lands on the History tab.
 * The browser world reaches the same contract through Panels > Training.
 */
export function makeHistoryDriver(boardSeam: HistoryBoardSeam): HistoryDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const rows = () => wrapper!.findAll('.history-row');
  // The panel's refresh awaits crypto.subtle digests (modelIdentity) — NATIVE
  // async that one flushPromises pass does not chain. A few macrotask turns
  // let those resolve deterministically (the browser world settles on real
  // time for the same reason).
  const settle = async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await flushPromises();
  };
  return {
    async open() {
      wrapper = mount(TrainingZone, {
        global: { mocks: { $boardInterface: boardSeam, $kerasInterface: {} } },
        attachTo: document.body,
      });
      const tabs = wrapper.findAll('.TrainingZone.bar-button');
      await tabs.find(tab => tab.text() === 'History')!.trigger('click');
      // The panel's mounted() listRuns round-trip is a promise: let it land.
      await settle();
    },
    async close() {
      wrapper!.unmount();
      wrapper = null;
    },
    async rowCount() {
      return rows().length;
    },
    async rowText(index) {
      return rows()[index]!.text();
    },
    async emptyText() {
      const empty = wrapper!.find('.history-empty');
      return empty.exists() ? empty.text() : null;
    },
    async view(index) {
      await wrapper!.findAll('.history-view')[index]!.trigger('click');
      await settle();
    },
    async curvesVisible() {
      return wrapper!.find('.history-curves').exists();
    },
    async curveSeriesCount() {
      return wrapper!.findAll('.history-curves .lines path').length;
    },
    async curvesText() {
      return wrapper!.find('.history-curves').text();
    },
    async restore(index) {
      await wrapper!.findAll('.history-restore')[index]!.trigger('click');
      await settle();
    },
    async requestDelete(index) {
      await wrapper!.findAll('.history-delete')[index]!.trigger('click');
      await settle(); // the deleteChoices promise decides the buttons
      return wrapper!.findAll('.history-confirm-delete').map(button => button.text());
    },
    async confirmDelete(label) {
      const buttons = wrapper!.findAll('.history-confirm-delete, .history-cancel-delete');
      await buttons.find(button => button.text() === label)!.trigger('click');
      await settle();
    },
    async groupHeaders() {
      return wrapper!.findAll('.history-group').map(header => header.text());
    },
    async setFilter(name, value) {
      await wrapper!.find(`.history-filters select[data-filter="${name}"]`).setValue(value);
      await settle();
    },
    async setShowHidden(on) {
      await wrapper!.find('.history-show-hidden input').setValue(on);
      await settle();
    },
    async unhide(index) {
      await wrapper!.findAll('.history-unhide')[index]!.trigger('click');
      await settle();
    },
    async provenanceText() {
      const line = wrapper!.find('.history-provenance');
      return line.exists() ? line.text() : '';
    },
    async selectForCompare(index) {
      await wrapper!.findAll('.history-compare-check')[index]!.setValue(true);
      await settle();
    },
    async compare() {
      await wrapper!.find('.history-compare-button').trigger('click');
      await settle(); // the verdict's identity hashes are async
    },
    async compareText() {
      return wrapper!.find('.ComparePanel').text();
    },
    async compareSeriesCount() {
      return wrapper!.findAll('.compare-chart .lines path').length;
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      resetTrainingConfig(); // module state must not leak between tests
    },
  };
}

/**
 * The Models window (Phase G3), mounted directly (mounting IS opening, the
 * TrainingZone pattern). Same macrotask settle as the history driver — the
 * evolution graph awaits crypto.subtle identity hashes.
 */
export function makeModelsDriver(boardSeam: HistoryBoardSeam): ModelsDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const settle = async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await flushPromises();
  };
  return {
    async open() {
      wrapper = mount(ModelsWindow, {
        global: { mocks: { $boardInterface: boardSeam, $kerasInterface: {} } },
        attachTo: document.body,
      });
      await settle();
    },
    async close() {
      wrapper!.unmount();
      wrapper = null;
    },
    async text() {
      return wrapper!.find('.ModelsWindow').text();
    },
    async showGraph() {
      await wrapper!.find('.models-view-graph').trigger('click');
      // A big journal means hundreds of sequential identity digests — real
      // async TIME, not a fixed number of turns. Poll until the panel has an
      // answer (nodes rendered, or the empty line) instead of guessing.
      for (let attempt = 0; attempt < 400; attempt += 1) {
        await flushPromises();
        if (wrapper!.find('.evolution-node').exists() || wrapper!.find('.models-empty').exists()) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      await flushPromises();
    },
    async nodeCount() {
      return wrapper!.findAll('.evolution-node').length;
    },
    async select(index) {
      await wrapper!.findAll('.evolution-node')[index]!.trigger('click');
      await settle();
    },
    async next() {
      await wrapper!.find('.models-next').trigger('click');
      await settle();
    },
    async prev() {
      await wrapper!.find('.models-prev').trigger('click');
      await settle();
    },
    async previewBoxCount() {
      return wrapper!.findAll('.models-preview rect').length;
    },
    async loadSelected() {
      await wrapper!.find('.models-load').trigger('click');
      await settle();
    },
    async setFilter(name, value) {
      await wrapper!.find(`[data-mfilter="${name}"]`).setValue(value);
      await settle();
    },
    async toggleOrder() {
      await wrapper!.find('.models-order').trigger('click');
      await settle();
    },
    async showMap() {
      await wrapper!.find('.models-view-map').trigger('click');
      for (let attempt = 0; attempt < 400; attempt += 1) {
        await flushPromises();
        if (wrapper!.find('.evolution-map-node').exists() || wrapper!.find('.models-empty').exists()) break;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      await flushPromises();
    },
    async mapNodeCount() {
      return wrapper!.findAll('.evolution-map-node').length;
    },
    async mapThumbBoxCount() {
      return wrapper!.findAll('.map-thumb rect').length;
    },
    async selectMapNode(index) {
      await wrapper!.findAll('.evolution-map-node')[index]!.trigger('click');
      await settle();
    },
    async rate(value) {
      await wrapper!.find('.models-rating-slider').setValue(String(value));
      await settle();
    },
    async mapZoom(deltaY) {
      await wrapper!.find('.evolution-map').trigger('wheel', { deltaY, ctrlKey: true });
      await settle();
    },
    async mapClusterCount() {
      return wrapper!.findAll('.map-cluster').length;
    },
    async openFiles() {
      await wrapper!.find('.models-view-files').trigger('click');
      await settle();
    },
    async filesText() {
      return wrapper!.find('.models-files').text();
    },
    async newFolder(name) {
      await wrapper!.find('.files-new-input').setValue(name);
      await wrapper!.find('.files-new-btn').trigger('click');
      await settle();
    },
    async openFolder(name) {
      const row = wrapper!.findAll('.files-subfolder')
        .find(candidate => candidate.find('.files-subfolder-name').text() === name);
      await row!.trigger('dblclick');
      await settle();
    },
    async filesUp() {
      const crumbs = wrapper!.findAll('.files-crumb');
      await crumbs[crumbs.length - 2]!.trigger('click');
      await settle();
    },
    async filesBack() {
      await wrapper!.find('.files-back').trigger('click');
      await settle();
    },
    async filesForward() {
      await wrapper!.find('.files-forward').trigger('click');
      await settle();
    },
    async favoriteSelected() {
      await wrapper!.find('.models-fav').trigger('click');
      await settle();
    },
    async startSaveTo() {
      await wrapper!.find('.models-save-to').trigger('click');
      await settle();
    },
    async saveHere() {
      await wrapper!.find('.files-save-here').trigger('click');
      await settle();
    },
    async fileLoad(index) {
      await wrapper!.findAll('.files-entry-load')[index]!.trigger('click');
      await settle();
    },
    async selectEntry(index) {
      await wrapper!.findAll('.files-entry')[index]!.trigger('click');
      await settle();
    },
    async selectFolder(name) {
      const row = wrapper!.findAll('.files-subfolder')
        .find(candidate => candidate.find('.files-subfolder-name').text() === name);
      await row!.trigger('click');
      await settle();
    },
    async deleteSelected() {
      await wrapper!.find('.files-delete').trigger('click');
      await settle();
    },
    async confirmDialog() {
      await wrapper!.find('.files-dialog-confirm').trigger('click');
      await settle();
    },
    async renameSelected(newName) {
      await wrapper!.find('.files-rename').trigger('click');
      await wrapper!.find('.files-dialog-input').setValue(newName);
      await wrapper!.find('.files-dialog-confirm').trigger('click');
      await settle();
    },
    async cutSelected() {
      await wrapper!.find('.files-cut').trigger('click');
      await settle();
    },
    async copySelected() {
      await wrapper!.find('.files-copy').trigger('click');
      await settle();
    },
    async paste() {
      await wrapper!.find('.files-paste').trigger('click');
      await settle();
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      resetWindowRects();
    },
  };
}

export function makeChatDriver(): ChatDriver & Teardown {
  let wrapper: Wrapper | null = null;
  return {
    /** Sign in/out by controlling the real localStorage boundary. */
    async setSignedIn(signedIn) {
      if (signedIn) localStorage.setItem('nnvp_backend_token', 'test-token');
      else localStorage.removeItem('nnvp_backend_token');
      bus.emit('auth.changed');
    },
    async open() {
      // Mounting IS opening now: App mounts ChatBubble when Panels > Chat is
      // ticked, and the window shows as soon as it exists.
      wrapper = mount(ChatBubble, {
        global: { mocks: stubGlobalProperties() },
        attachTo: document.body,
      });
      await wrapper.vm.$nextTick();
    },
    async connectPromptVisible() {
      return wrapper!.find('.chat-connect').exists();
    },
    async inputEnabled() {
      const input = wrapper!.find('.chat-input');
      return input.exists() && !input.attributes('disabled') && input.attributes('disabled') !== '';
    },
    /** The gear's contract: it opens the account panel at the usage section
        (no in-chat settings UI, so no API key field can exist). */
    async settingsOpensAccountUsage() {
      await wrapper!.find('[aria-label="Settings"]').trigger('click');
      const emitted = wrapper!.findComponent({ name: 'ChatBubble' }).emitted('open-account');
      return Boolean(emitted && emitted[emitted.length - 1]![0] === 'usage');
    },
    async signInFromPrompt() {
      await wrapper!.find('.chat-connect button').trigger('click');
      return wrapper!.emitted('open-account') !== undefined;
    },
    /** The help-modal handoff: fire the real bridge at a mounted ChatBubble. */
    async askAbout(topic) {
      if (!wrapper) {
        wrapper = mount(ChatBubble, {
          global: { mocks: stubGlobalProperties() },
          attachTo: document.body,
        });
      }
      askAssistant(topic);
      await wrapper.vm.$nextTick();
    },
    async lastAssistantText() {
      const bubbles = wrapper!.findAll('.chat-msg-assistant .chat-bubble-text');
      return bubbles.length ? bubbles[bubbles.length - 1]!.text() : '';
    },
    async signInBlinking() {
      return wrapper!.find('.chat-connect .chat-btn-blink').exists();
    },
    async windowPosition() {
      const { style } = wrapper!.find('.chat-panel').element as HTMLElement;
      return { x: parseFloat(style.left), y: parseFloat(style.top) };
    },
    async dragWindowBy(dx, dy) {
      await wrapper!.find('.chat-panel .floating-window-titlebar')
        .trigger('pointerdown', { clientX: 400, clientY: 400, button: 0 });
      window.dispatchEvent(Object.assign(new Event('pointermove'), {
        clientX: 400 + dx, clientY: 400 + dy, button: 0,
      }));
      window.dispatchEvent(Object.assign(new Event('pointerup'), {
        clientX: 400 + dx, clientY: 400 + dy, button: 0,
      }));
      await wrapper!.vm.$nextTick();
    },
    async closeWindow() {
      // In the app, 'close' makes App unmount the component.
      await wrapper!.find('.chat-panel .floating-window-close').trigger('click');
      wrapper!.unmount();
      wrapper = null;
    },
    /** The record-store round-trips are promises: flush them, then re-render. */
    async startNewConversation() {
      await wrapper!.find('.chat-conv-new').trigger('click');
      await flushPromises();
    },
    async conversationTitles() {
      const toggle = wrapper!.find('.chat-conv-toggle');
      if (toggle.attributes('aria-expanded') !== 'true') {
        await toggle.trigger('click');
        await flushPromises();
      }
      return wrapper!.findAll('.chat-conv-title').map(node => node.text());
    },
    async resumeConversation(index) {
      await wrapper!.findAll('.chat-conv-item')[index]!.trigger('click');
      await flushPromises();
    },
    async visibleMessageCount() {
      return wrapper!.findAll('.chat-messages .chat-message').length;
    },
    async requestDeleteConversation(index) {
      const toggle = wrapper!.find('.chat-conv-toggle');
      if (toggle.attributes('aria-expanded') !== 'true') {
        await toggle.trigger('click');
        await flushPromises();
      }
      await wrapper!.findAll('.chat-conv-delete')[index]!.trigger('click');
      await flushPromises();
      return wrapper!.findAll('.chat-conv-del-choice').map(node => node.text());
    },
    async confirmDeleteConversation(label) {
      const buttons = wrapper!.findAll('.chat-conv-del-choice, .chat-conv-del-cancel');
      await buttons.find(button => button.text() === label)!.trigger('click');
      await flushPromises();
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      localStorage.removeItem('nnvp_backend_token');
      resetWindowRects(); // window positions must not leak between tests
      resetChatSession(); // neither does the conversation
    },
  };
}
