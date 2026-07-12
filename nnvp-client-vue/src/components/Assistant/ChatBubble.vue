<template>
  <div class="chat-assistant">
    <!-- Chat panel -->
    <Transition name="chat-panel">
      <div
        v-if="open"
        id="chat-panel"
        ref="panel"
        class="chat-panel floating-panel"
        role="dialog"
        aria-label="Assistant"
      >
        <div class="chat-header">
          <div class="chat-title">Assistant</div>
          <div class="chat-header-actions">
            <button class="chat-icon-btn" aria-label="Settings" @click="toggleSettings">⚙</button>
            <button class="chat-icon-btn" aria-label="Close" @click="open = false">×</button>
          </div>
        </div>

        <!-- Settings popover. The assistant runs through the NNVP backend
             (server-side key) — there is nothing key-related to configure. -->
        <div v-if="settingsOpen" class="chat-settings">
          <div v-if="proxyActive" class="chat-proxy-hint">
            Using your NNVP account.
          </div>
          <label class="chat-field">
            <span>Model</span>
            <input type="text" v-model="model" :placeholder="defaultModel">
          </label>
          <div class="chat-settings-actions">
            <button class="chat-btn" @click="saveSettings">Save</button>
          </div>
        </div>

        <!-- Guardrail: read-only vs allowed-to-edit mode. Read-only is the
             default so the assistant cannot mutate the model without opt-in. -->
        <div class="chat-mode-row">
          <span class="chat-mode-label">Mode</span>
          <div class="chat-mode-controls">
            <button
              type="button"
              class="help-icon"
              aria-label="About assistant modes"
              @click="showModeHelp = true"
            >?</button>
            <div class="chat-mode-toggle" role="group" aria-label="Assistant mode">
              <button
                type="button"
                :class="['chat-mode-btn', { active: !allowEdits }]"
                :aria-pressed="!allowEdits"
                @click="setMode(false)"
              >
                Read-only
              </button>
              <button
                type="button"
                :class="['chat-mode-btn', 'chat-mode-btn-edits', { active: allowEdits }]"
                :aria-pressed="allowEdits"
                @click="setMode(true)"
              >
                Allow edits
              </button>
            </div>
          </div>
        </div>

        <!-- Mode help modal (reuses the app-wide help modal styling) -->
        <Teleport to="body">
          <Transition name="modal">
          <div v-if="showModeHelp" class="layer-help-modal-overlay" @click="showModeHelp = false">
            <div
              class="layer-help-modal-container"
              role="dialog"
              aria-modal="true"
              aria-label="Assistant modes help"
              @click.stop
            >
              <button class="layer-help-modal-close" aria-label="Close" @click="showModeHelp = false">&times;</button>
              <div class="layer-help-modal-body">
                <h2>Assistant modes</h2>
                <p><strong>Read-only:</strong> the assistant can inspect your model and generate code, but cannot change anything.</p>
                <p><strong>Allow edits:</strong> the assistant can modify your model — add or delete layers, change parameters, undo and redo.</p>
              </div>
            </div>
          </div>
          </Transition>
        </Teleport>

        <div class="chat-messages" ref="messagesEl">
          <div v-if="!hasKey" class="chat-empty chat-connect">
            <p>Sign in to talk to the assistant — it can inspect and build
            your model for you. No API key needed.</p>
            <button type="button" class="chat-btn" @click="$emit('open-account')">
              Sign in
            </button>
          </div>
          <div v-else-if="messages.length === 0" class="chat-empty">
            Ask me to inspect or build your Keras model.
          </div>
          <div
            v-for="(message, index) in messages"
            :key="index"
            :class="['chat-message', 'chat-msg-' + message.role]"
          >
            <div v-if="message.role === 'tool'" class="chat-tool">
              <span class="chat-tool-name">{{ message.text }}</span>
            </div>
            <div v-else-if="message.role === 'notice'" class="chat-notice">
              {{ message.text }}
            </div>
            <div
              v-else-if="message.role === 'assistant'"
              :class="['chat-bubble-text', 'chat-bubble-md', { 'chat-bubble-error': message.isError }]"
              v-html="renderMarkdown(message.text)"
            ></div>
            <div v-else :class="['chat-bubble-text', { 'chat-bubble-error': message.isError }]">
              {{ message.text }}
            </div>
          </div>
          <div v-if="sending" class="chat-message chat-msg-assistant">
            <div class="chat-bubble-text chat-typing" aria-label="Assistant is thinking">
              <span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>
            </div>
          </div>
        </div>

        <form class="chat-input-row" @submit.prevent="send">
          <input
            ref="draftInput"
            v-model="draft"
            class="chat-input"
            aria-label="Message the assistant"
            placeholder="Message the assistant"
            :disabled="sending || !hasKey"
          >
          <button
            type="submit"
            class="chat-send"
            :disabled="sending || !hasKey || draft.trim() === ''"
          >
            Send
          </button>
        </form>
      </div>
    </Transition>

    <!-- Bubble toggle -->
    <button
      class="chat-fab"
      aria-label="Toggle assistant"
      aria-haspopup="dialog"
      aria-controls="chat-panel"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span v-if="!open" aria-hidden="true">💬</span>
      <span v-else aria-hidden="true">×</span>
    </button>
  </div>
</template>

<script>
import AssistantActions from '../../lib/Assistant/assistantActions';
import renderMarkdown from '../../lib/Assistant/markdown';
import AnthropicClient, {
  STORAGE_KEY,
  STORAGE_BASE_URL,
  STORAGE_MODEL,
  STORAGE_ALLOW_EDITS,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  readStoredConfig,
  usesBackendProxy,
} from '../../lib/Assistant/anthropicClient';

export default {
  name: 'ChatBubble',
  emits: ['open-account'],
  data() {
    return {
      open: false,
      settingsOpen: false,
      showModeHelp: false,
      draft: '',
      sending: false,
      messages: [],
      history: [],
      apiKey: '',
      model: '',
      baseUrl: '',
      defaultModel: DEFAULT_MODEL,
      defaultBaseUrl: DEFAULT_BASE_URL,
      hasKey: false,
      // True when requests will go through the NNVP backend proxy (signed in,
      // no user key / custom base URL) — drives the settings hint.
      proxyActive: false,
      allowEdits: false,
    };
  },
  created() {
    if (typeof localStorage !== 'undefined') {
      this.apiKey = localStorage.getItem(STORAGE_KEY) || '';
      this.model = localStorage.getItem(STORAGE_MODEL) || '';
      this.baseUrl = localStorage.getItem(STORAGE_BASE_URL) || '';
    }
    this.refreshHasKey();
    if (typeof localStorage !== 'undefined') {
      this.allowEdits = localStorage.getItem(STORAGE_ALLOW_EDITS) === 'true';
    }
    this.actions = new AssistantActions(this.$d3Interface, this.$kerasInterface);
    this.client = new AnthropicClient(this.actions, { allowEdits: this.allowEdits });
  },
  mounted() {
    // Sign-in / sign-out elsewhere in the app flips the chat between its two
    // states live (apiClient dispatches this on every token change).
    this.onAuthChanged = () => this.refreshHasKey();
    window.addEventListener('nnvp:auth-changed', this.onAuthChanged);
  },
  beforeUnmount() {
    window.removeEventListener('nnvp:auth-changed', this.onAuthChanged);
  },
  methods: {
    renderMarkdown,
    toggleOpen() {
      this.open = !this.open;
      if (this.open) {
        // The user may have signed in (or out) since the component mounted;
        // re-resolve the config so the keyless proxy default kicks in live.
        this.refreshHasKey();
        // Move focus into the panel: the message field when it is enabled,
        // otherwise the first available control (e.g. Settings).
        this.$nextTick(() => {
          const input = this.$refs.draftInput;
          if (input && !input.disabled) {
            input.focus();
            return;
          }
          const panel = this.$refs.panel;
          const focusable = panel && panel.querySelector('button, input:not([disabled]), [tabindex]');
          if (focusable) focusable.focus();
        });
      }
    },
    toggleSettings() {
      this.settingsOpen = !this.settingsOpen;
    },
    setMode(allowEdits) {
      this.allowEdits = allowEdits;
      if (this.client) this.client.setAllowEdits(allowEdits);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_ALLOW_EDITS, allowEdits ? 'true' : 'false');
      }
    },
    saveSettings() {
      if (typeof localStorage !== 'undefined') {
        if (this.apiKey) localStorage.setItem(STORAGE_KEY, this.apiKey);
        else localStorage.removeItem(STORAGE_KEY);
        if (this.model) localStorage.setItem(STORAGE_MODEL, this.model);
        else localStorage.removeItem(STORAGE_MODEL);
        if (this.baseUrl) localStorage.setItem(STORAGE_BASE_URL, this.baseUrl);
        else localStorage.removeItem(STORAGE_BASE_URL);
      }
      this.refreshHasKey();
      this.settingsOpen = false;
    },
    // "Ready to chat" means either a user-provided Anthropic key, or the
    // resolved base URL pointing at the NNVP backend proxy while signed in
    // (which readStoredConfig now defaults to for keyless signed-in users).
    refreshHasKey() {
      const config = readStoredConfig();
      this.proxyActive = usesBackendProxy(config) && Boolean(config.backendToken);
      this.hasKey = Boolean(config.apiKey) || this.proxyActive;
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.messagesEl;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    // One short human line instead of the technical error: only the two
    // actionable cases keep their meaning, everything else is "difficulties".
    shortErrorText(error) {
      const detail = String((error && error.message) || error || '').toLowerCase();
      if (detail.includes('sign in') || detail.includes('401')) {
        return 'Session expired — please sign in again.';
      }
      if (detail.includes('rate limit') || detail.includes('429')) {
        return 'Rate limited — try again in a moment.';
      }
      return 'Currently experiencing technical difficulties — please try again soon.';
    },
    pushMessage(role, text, isError = false) {
      this.messages.push({ role, text, isError });
      this.scrollToBottom();
    },
    async send() {
      const text = this.draft.trim();
      if (text === '' || this.sending || !this.hasKey) return;
      this.draft = '';
      this.pushMessage('user', text);
      this.history.push({ role: 'user', content: text });
      this.sending = true;
      try {
        const onActivity = (event) => {
          if (event.type === 'tool_use') {
            this.pushMessage('tool', `⚙ ${event.name}`);
          }
        };
        const reply = await this.client.send(this.history, onActivity);
        if (reply) this.pushMessage('assistant', reply);
      } catch (error) {
        // Full detail goes to the console for debugging; the chat shows a
        // short centered notice instead of a technical error bubble.
        console.warn('[assistant] request failed:', error); // eslint-disable-line no-console
        this.pushMessage('notice', this.shortErrorText(error), true);
      } finally {
        this.sending = false;
        this.scrollToBottom();
      }
    },
  },
};
</script>

<style scoped>
.chat-assistant {
  position: absolute;
  right: var(--panel-margin);
  bottom: var(--panel-margin);
  z-index: 200;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
}

.chat-fab {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: var(--border-width) solid var(--panel-border);
  background-color: var(--bg-panel);
  box-shadow: var(--panel-shadow);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}

.chat-fab:hover {
  transform: translateY(-1px);
}

.chat-fab:focus-visible,
.chat-icon-btn:focus-visible {
  outline: 2px solid #000000;
  outline-offset: 2px;
}

.chat-panel {
  position: absolute;
  right: 0;
  bottom: 64px;
  width: 340px;
  height: 460px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: visible;
  color: var(--text-primary);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--panel-border);
  font-weight: var(--font-weight-semibold);
}

.chat-title {
  font-weight: var(--font-weight-semibold);
}

.chat-header-actions {
  display: flex;
  gap: 4px;
}

.chat-icon-btn {
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.chat-icon-btn:hover {
  background-color: var(--bg-hover);
}

.chat-settings {
  padding: 12px 14px;
  border-bottom: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--bg-elevated);
}

.chat-proxy-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.chat-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.chat-field input {
  font-size: 13px;
}

.chat-field-warning {
  color: #b91c1c;
  font-size: 11px;
}

.chat-settings-actions {
  display: flex;
  justify-content: flex-end;
}

.chat-mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--panel-border);
}

.chat-mode-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: var(--font-weight-medium);
}

.chat-mode-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  overflow: hidden;
}

.chat-mode-btn {
  border: none;
  background: transparent;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 0;
}

.chat-mode-btn.active {
  background-color: var(--fill-strong);
  color: var(--fill-strong-text);
}

/* "Allow edits" active = same color as a selected layer on the board: the
   assistant being able to touch the model reads like a selection. */
.chat-mode-btn-edits.active {
  background-color: var(--node-selected-fill);
  color: var(--node-text);
}

.chat-btn {
  cursor: pointer;
}

.chat-messages {
  flex: 1;
  /* Without min-height:0 a flex child never shrinks below its content, so a
     long conversation grows past the panel and paints over the input row
     instead of scrolling. */
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-empty {
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  margin: auto 0;
}
.chat-connect {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.chat-connect p { margin: 0; }

/* Short centered notice (errors and the like) instead of a message bubble. */
.chat-message.chat-msg-notice {
  justify-content: center;
}
.chat-notice {
  color: #b91c1c;
  font-size: 12px;
  text-align: center;
  padding: 4px 8px;
}

.chat-message {
  display: flex;
}

.chat-msg-user {
  justify-content: flex-end;
}

.chat-bubble-text {
  max-width: 85%;
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-msg-user .chat-bubble-text {
  background-color: var(--fill-strong);
  color: var(--fill-strong-text);
}

.chat-msg-assistant .chat-bubble-text {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.chat-bubble-error {
  background-color: #fee2e2 !important;
  color: #b91c1c !important;
  border: 1px solid #fca5a5;
}

.chat-tool {
  font-size: 11px;
  color: var(--text-muted);
}

.chat-tool-name {
  font-family: monospace;
}

.chat-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 18px;
}
.chat-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: chat-typing-pulse 1.2s ease-in-out infinite;
}
.chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes chat-typing-pulse {
  0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

/* Markdown inside assistant bubbles (see lib/Assistant/markdown.js). */
.chat-bubble-md p { margin: 0 0 6px 0; }
.chat-bubble-md p:last-child { margin-bottom: 0; }
.chat-bubble-md ul,
.chat-bubble-md ol { margin: 0 0 6px 0; padding-left: 18px; }
.chat-bubble-md li { margin: 2px 0; }
.chat-bubble-md code {
  font-family: monospace;
  font-size: 12px;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 4px;
  padding: 0 4px;
}
.chat-bubble-md pre {
  margin: 0 0 6px 0;
  padding: 8px;
  background: rgba(127, 127, 127, 0.12);
  border-radius: 6px;
  overflow-x: auto;
}
.chat-bubble-md pre code { background: none; padding: 0; }
.chat-bubble-md a { color: var(--accent); }

.chat-input-row {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--panel-border);
}

.chat-input {
  flex: 1;
  font-size: 13px;
}

.chat-send {
  cursor: pointer;
}

.chat-send:disabled {
  opacity: 0.5;
  cursor: default;
}

.chat-panel-enter-active,
.chat-panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.chat-panel-enter-from,
.chat-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
