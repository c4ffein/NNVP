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

        <!-- Settings popover -->
        <div v-if="settingsOpen" class="chat-settings">
          <label class="chat-field">
            <span>Anthropic API key</span>
            <input
              type="password"
              v-model="apiKey"
              placeholder="sk-ant-..."
              autocomplete="off"
            >
            <span v-if="apiKeyWarning" class="chat-field-warning">{{ apiKeyWarning }}</span>
          </label>
          <label class="chat-field">
            <span>Model</span>
            <input type="text" v-model="model" :placeholder="defaultModel">
          </label>
          <label class="chat-field">
            <span>Base URL (optional proxy)</span>
            <input type="text" v-model="baseUrl" :placeholder="defaultBaseUrl">
          </label>
          <div class="chat-settings-actions">
            <button class="chat-btn" @click="saveSettings">Save</button>
          </div>
        </div>

        <!-- Guardrail: read-only vs allowed-to-edit mode. Read-only is the
             default so the assistant cannot mutate the model without opt-in. -->
        <div class="chat-mode-row">
          <span class="chat-mode-label">Mode</span>
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
              :class="['chat-mode-btn', { active: allowEdits }]"
              :aria-pressed="allowEdits"
              @click="setMode(true)"
            >
              Allow edits
            </button>
          </div>
        </div>
        <div v-if="allowEdits" class="chat-mode-hint chat-mode-hint-warn">
          The assistant can modify your model (add/delete layers, change parameters).
        </div>
        <div v-else class="chat-mode-hint">
          Read-only: the assistant can inspect and generate code, but not change the model.
        </div>

        <div class="chat-messages" ref="messagesEl">
          <div v-if="!hasKey" class="chat-empty">
            Add your Anthropic API key in settings (⚙) to start chatting.
          </div>
          <div v-else-if="messages.length === 0" class="chat-empty">
            Ask me to inspect or build your Keras model.
          </div>
          <div
            v-for="(message, index) in messages"
            :key="index"
            :class="['chat-message', 'chat-' + message.role]"
          >
            <div v-if="message.role === 'tool'" class="chat-tool">
              <span class="chat-tool-name">{{ message.text }}</span>
            </div>
            <div v-else :class="['chat-bubble-text', { 'chat-bubble-error': message.isError }]">
              {{ message.text }}
            </div>
          </div>
          <div v-if="sending" class="chat-message chat-assistant-msg">
            <div class="chat-bubble-text chat-typing">…</div>
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
import AnthropicClient, {
  STORAGE_KEY,
  STORAGE_BASE_URL,
  STORAGE_MODEL,
  STORAGE_ALLOW_EDITS,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  isPlausibleApiKey,
  readStoredConfig,
  usesBackendProxy,
} from '../../lib/Assistant/anthropicClient';

export default {
  name: 'ChatBubble',
  data() {
    return {
      open: false,
      settingsOpen: false,
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
      allowEdits: false,
    };
  },
  computed: {
    // Warn (but do not block) when the pasted key does not look like a key.
    apiKeyWarning() {
      if (this.apiKey === '') return '';
      return isPlausibleApiKey(this.apiKey) ? '' : 'This does not look like a valid API key.';
    },
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
  methods: {
    toggleOpen() {
      this.open = !this.open;
      if (this.open) {
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
    // "Ready to chat" means either a user-provided Anthropic key, or the base
    // URL pointing at the NNVP backend proxy while signed in (JWT present).
    refreshHasKey() {
      const config = readStoredConfig();
      this.hasKey = Boolean(this.apiKey)
        || (usesBackendProxy(config) && Boolean(config.backendToken));
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.messagesEl;
        if (el) el.scrollTop = el.scrollHeight;
      });
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
        this.pushMessage('assistant', `Error: ${(error && error.message) || error}`, true);
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
  color: #666666;
  font-weight: var(--font-weight-medium);
}

.chat-mode-toggle {
  display: inline-flex;
  border: 1px solid #cccccc;
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
  background-color: #000000;
  color: #ffffff;
}

.chat-mode-hint {
  padding: 6px 14px;
  font-size: 11px;
  color: #666666;
  border-bottom: 1px solid var(--panel-border);
}

.chat-mode-hint-warn {
  color: #92400e;
  background-color: #fef3c7;
}

.chat-btn {
  cursor: pointer;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
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

.chat-message {
  display: flex;
}

.chat-user {
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

.chat-user .chat-bubble-text {
  background-color: var(--fill-strong);
  color: var(--fill-strong-text);
}

.chat-assistant .chat-bubble-text,
.chat-assistant-msg .chat-bubble-text {
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
  letter-spacing: 2px;
}

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
