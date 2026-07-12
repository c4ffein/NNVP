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
import { mount } from '@vue/test-utils';
import ChatBubble from '../../src/components/Assistant/ChatBubble.vue';
import LayerCatalog from '../../src/components/LayerCatalog/LayerCatalog.vue';
import { askAssistant } from '../../src/lib/Assistant/askAssistant';

function stubGlobalProperties() {
  // ChatBubble builds AssistantActions over these; the chat-state helpers
  // never invoke tools, so inert stubs are enough.
  return {
    $d3Interface: { on: () => {}, off: () => {} },
    $kerasInterface: {},
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
          $d3Interface: {
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
      wrapper = mount(ChatBubble, {
        global: { mocks: stubGlobalProperties() },
        attachTo: document.body,
      });
      await wrapper.find('.chat-fab').trigger('click');
      await wrapper.vm.$nextTick();
    },
    async connectPromptVisible() {
      return wrapper.find('.chat-connect').exists();
    },
    async inputEnabled() {
      const input = wrapper.find('.chat-input');
      return input.exists() && !input.attributes('disabled') && input.attributes('disabled') !== '';
    },
    async settingsAsksForApiKey() {
      await wrapper.find('[aria-label="Settings"]').trigger('click');
      await wrapper.vm.$nextTick();
      const text = wrapper.find('.chat-settings').text();
      return /api key/i.test(text) && wrapper.find('.chat-settings input[type="password"]').exists();
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
    async teardown() {
      if (wrapper) wrapper.unmount();
      localStorage.removeItem('nnvp_backend_token');
    },
  };
}
