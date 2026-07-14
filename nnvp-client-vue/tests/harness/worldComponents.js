/**
 * Component-backed world helpers for BUN mode: mount REAL SFCs (via
 * tests/vue-loader.js + @vue/test-utils + happy-dom) and drive them the way
 * the app would. The browser world implements the same helper surface by
 * clicking the real UI.
 *
 * Components read auth from localStorage and talk HTTP through fetch, so the
 * helpers control those two boundaries — nothing inside the components is
 * faked.
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import ChatBubble from '../../src/components/Assistant/ChatBubble.vue';
import LayerCatalog from '../../src/components/LayerCatalog/LayerCatalog.vue';
import FloatingWindow from '../../src/components/FloatingWindow.vue';
import Charts from '../../src/components/TrainingZone/Charts.vue';
import { resetWindowRects } from '../../src/lib/windowing';
import { askAssistant } from '../../src/lib/Assistant/askAssistant';

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
export function makeChartsDriver() {
  let wrapper = null;
  return {
    async open() {
      wrapper = mount(Charts, { attachTo: document.body });
    },
    async helpText(which) {
      const buttons = wrapper.findAll('.chart-help');
      await buttons[which === 'batch' ? 0 : 1].trigger('click');
      await wrapper.vm.$nextTick();
      const modal = document.body.querySelector('.layer-help-modal-body');
      const text = modal ? modal.textContent : '';
      const close = document.body.querySelector('.layer-help-modal-close');
      if (close) close.click();
      await wrapper.vm.$nextTick();
      return text;
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

export function makeWindowsDriver() {
  let wrapper = null;
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
  const el = (name) => wrapper.find(name === 'a' ? '.win-a' : '.win-b');
  const firePointer = (type, x, y) => {
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
      const { style } = el(name).element;
      return { x: parseFloat(style.left), y: parseFloat(style.top) };
    },
    async size(name) {
      const { style } = el(name).element;
      return { width: parseFloat(style.width), height: parseFloat(style.height) };
    },
    async zIndexOf(name) {
      return parseInt(el(name).element.style.zIndex, 10);
    },
    async raise(name) {
      await el(name).trigger('pointerdown', { clientX: 60, clientY: 60, button: 0 });
    },
    async dragBy(name, dx, dy) {
      await el(name).find('.floating-window-titlebar')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500 + dy);
      firePointer('pointerup', 500 + dx, 500 + dy);
      await wrapper.vm.$nextTick();
    },
    async resizeBy(name, dx, dy) {
      await el(name).find('.floating-window-resize')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500 + dy);
      firePointer('pointerup', 500 + dx, 500 + dy);
      await wrapper.vm.$nextTick();
    },
    async resizeLeftEdgeBy(name, dx) {
      await el(name).find('.fw-edge-w')
        .trigger('pointerdown', { clientX: 500, clientY: 500, button: 0 });
      firePointer('pointermove', 500 + dx, 500);
      firePointer('pointerup', 500 + dx, 500);
      await wrapper.vm.$nextTick();
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

export function makeCatalogDriver() {
  let wrapper = null;
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
      await wrapper.find('.collapse-all-button').trigger('click');
    },
    async toggleCategory(name) {
      await wrapper.find(`[aria-label="Toggle ${name} layers"]`).trigger('click');
    },
    /** True when the master arrow offers "expand all" (fully collapsed). */
    async masterArrowCollapsed() {
      return wrapper.find('.collapse-all-arrow').classes().includes('collapsed');
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
    },
  };
}

export function makeChatDriver() {
  let wrapper = null;
  return {
    /** Sign in/out by controlling the real localStorage boundary. */
    async setSignedIn(signedIn) {
      if (signedIn) localStorage.setItem('nnvp_backend_token', 'test-token');
      else localStorage.removeItem('nnvp_backend_token');
      window.dispatchEvent(new CustomEvent('nnvp:auth-changed'));
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
      return wrapper.find('.chat-connect').exists();
    },
    async inputEnabled() {
      const input = wrapper.find('.chat-input');
      return input.exists() && !input.attributes('disabled') && input.attributes('disabled') !== '';
    },
    /** The gear's contract: it opens the account panel at the usage section
        (no in-chat settings UI, so no API key field can exist). */
    async settingsOpensAccountUsage() {
      await wrapper.find('[aria-label="Settings"]').trigger('click');
      const emitted = wrapper.findComponent({ name: 'ChatBubble' }).emitted('open-account');
      return Boolean(emitted && emitted[emitted.length - 1][0] === 'usage');
    },
    async signInFromPrompt() {
      await wrapper.find('.chat-connect button').trigger('click');
      return wrapper.emitted('open-account') !== undefined;
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
      const bubbles = wrapper.findAll('.chat-msg-assistant .chat-bubble-text');
      return bubbles.length ? bubbles[bubbles.length - 1].text() : '';
    },
    async signInBlinking() {
      return wrapper.find('.chat-connect .chat-btn-blink').exists();
    },
    async windowPosition() {
      const { style } = wrapper.find('.chat-panel').element;
      return { x: parseFloat(style.left), y: parseFloat(style.top) };
    },
    async dragWindowBy(dx, dy) {
      await wrapper.find('.chat-panel .floating-window-titlebar')
        .trigger('pointerdown', { clientX: 400, clientY: 400, button: 0 });
      window.dispatchEvent(Object.assign(new Event('pointermove'), {
        clientX: 400 + dx, clientY: 400 + dy, button: 0,
      }));
      window.dispatchEvent(Object.assign(new Event('pointerup'), {
        clientX: 400 + dx, clientY: 400 + dy, button: 0,
      }));
      await wrapper.vm.$nextTick();
    },
    async closeWindow() {
      // In the app, 'close' makes App unmount the component.
      await wrapper.find('.chat-panel .floating-window-close').trigger('click');
      wrapper.unmount();
      wrapper = null;
    },
    async teardown() {
      if (wrapper) wrapper.unmount();
      localStorage.removeItem('nnvp_backend_token');
      resetWindowRects(); // window positions must not leak between tests
    },
  };
}
