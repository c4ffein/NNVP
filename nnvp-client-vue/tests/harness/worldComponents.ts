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
  BackendDriver, CatalogDriver, ChartsDriver, ChatDriver, HistoryDriver, RecordsDriver,
  TrainingDriver, WindowsDriver, WindowName,
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
export function makeTrainingDriver(): TrainingDriver & Teardown {
  let wrapper: Wrapper | null = null;
  const optimizerSelect = () => wrapper!.find('.optimizer-section select');
  const epochsInput = () => wrapper!.find('.training-params-section input[type="number"]');
  return {
    async open() {
      wrapper = mount(TrainingZone, {
        // startTraining is the only $boardInterface consumer; these tests
        // never train, so inert stubs are enough (same pattern as ChatBubble).
        global: { mocks: { $boardInterface: {}, $kerasInterface: {} } },
        attachTo: document.body,
      });
      // Land on the Options tab, where the compile options form lives.
      const tabs = wrapper.findAll('.TrainingZone.bar-button');
      await tabs.find(tab => tab.text() === 'Options')!.trigger('click');
      await wrapper.vm.$nextTick();
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
  return {
    async open() {
      wrapper = mount(TrainingZone, {
        global: { mocks: { $boardInterface: boardSeam, $kerasInterface: {} } },
        attachTo: document.body,
      });
      const tabs = wrapper.findAll('.TrainingZone.bar-button');
      await tabs.find(tab => tab.text() === 'History')!.trigger('click');
      // The panel's mounted() listRuns round-trip is a promise: let it land.
      await flushPromises();
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
      await flushPromises();
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
      await flushPromises();
    },
    async requestDelete(index) {
      await wrapper!.findAll('.history-delete')[index]!.trigger('click');
      await flushPromises(); // the deleteChoices promise decides the buttons
      return wrapper!.findAll('.history-confirm-delete').map(button => button.text());
    },
    async confirmDelete(label) {
      const buttons = wrapper!.findAll('.history-confirm-delete, .history-cancel-delete');
      await buttons.find(button => button.text() === label)!.trigger('click');
      await flushPromises();
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      resetTrainingConfig(); // module state must not leak between tests
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
