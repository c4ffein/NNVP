<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div
        ref="container"
        class="account-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        tabindex="-1"
        @click.stop
      >
        <button class="modal-close" @click="closeModal" aria-label="Close">&times;</button>

        <div class="account-content">
          <h1 id="account-modal-title">Cloud</h1>
          <p class="subtitle">Optional accounts &amp; saved projects</p>

          <p v-if="error" class="msg msg-error" role="alert">{{ error }}</p>
          <p v-else-if="status" class="msg msg-ok" role="status">{{ status }}</p>

          <!-- Backend URL setting: always available so users can point at their own server -->
          <section class="section">
            <h2>Backend</h2>
            <label class="field">
              <span>Server URL</span>
              <input
                v-model="backendUrlDraft"
                type="url"
                placeholder="http://localhost:8009"
                autocomplete="off"
                @keydown.enter="saveBackendUrl"
              />
            </label>
            <div class="row">
              <button class="btn" @click="saveBackendUrl">Save URL</button>
              <span v-if="!isConfigured" class="hint">
                Leave empty to keep working fully offline.
              </span>
            </div>
          </section>

          <!-- Auth: only meaningful once a backend URL is set -->
          <section v-if="isConfigured && !user" class="section">
            <h2>{{ tab === 'register' ? 'Create account' : 'Sign in' }}</h2>
            <div class="tabs">
              <button
                class="tab" :class="{ active: tab === 'login' }"
                @click="tab = 'login'"
              >Sign in</button>
              <button
                class="tab" :class="{ active: tab === 'register' }"
                @click="tab = 'register'"
              >Register</button>
            </div>
            <label class="field">
              <span>Email</span>
              <input v-model="email" type="email" autocomplete="username" />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                v-model="password" type="password"
                autocomplete="current-password"
                @keydown.enter="submitAuth"
              />
            </label>
            <div class="row">
              <button class="btn btn-primary" :disabled="busy" @click="submitAuth">
                {{ tab === 'register' ? 'Create account' : 'Sign in' }}
              </button>
            </div>
          </section>

          <!-- Signed-in: current user + projects -->
          <template v-if="isConfigured && user">
            <section class="section">
              <h2>Account</h2>
              <div class="row account-row">
                <span class="user-email">{{ user.email }}</span>
                <button class="btn" @click="signOut">Sign out</button>
              </div>
            </section>

            <section class="section">
              <div class="section-head">
                <h2>My Projects</h2>
                <button class="btn btn-primary" :disabled="busy" @click="saveToCloud">
                  Save current
                </button>
              </div>

              <p v-if="projects.length === 0" class="hint">
                No saved projects yet. Use “Save current” to store the board.
              </p>
              <ul v-else class="project-list">
                <li v-for="p in projects" :key="p.id" class="project-item">
                  <button class="project-open" :disabled="busy" @click="openProject(p)">
                    <span class="project-name">{{ p.name }}</span>
                    <span class="project-date">{{ formatDate(p.updated_at) }}</span>
                  </button>
                  <button
                    class="btn btn-danger" :disabled="busy"
                    :aria-label="`Delete ${p.name}`"
                    @click="deleteProject(p)"
                  >Delete</button>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
import ApiClient, { ERROR_CODES } from '../../lib/Backend/apiClient';

export default {
  name: 'AccountPanel',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    // Optional intent when opened, e.g. 'save' to immediately save the board.
    intent: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      backendUrlDraft: '',
      isConfigured: false,
      user: null,
      projects: [],
      tab: 'login',
      email: '',
      password: '',
      busy: false,
      error: '',
      status: '',
    };
  },
  created() {
    // Non-reactive client; reads url/token from localStorage on every call.
    this.api = new ApiClient();
  },
  watch: {
    show(isOpen) {
      if (isOpen) this.onOpen();
      else this.restoreFocus();
    },
  },
  methods: {
    async onOpen() {
      this.error = '';
      this.status = '';
      this.backendUrlDraft = this.api.getBaseUrl();
      this.isConfigured = this.api.isConfigured();
      this.previouslyFocused = document.activeElement;
      this.$nextTick(() => {
        const container = this.$refs.container;
        if (container) {
          const focusable = container.querySelector('input, button');
          (focusable || container).focus();
        }
      });
      if (this.api.isLoggedIn()) {
        await this.loadSession();
        if (this.intent === 'save' && this.user) await this.saveToCloud();
      } else {
        this.user = null;
        this.projects = [];
      }
    },
    async loadSession() {
      this.busy = true;
      try {
        this.user = await this.api.me();
        await this.refreshProjects();
      } catch (e) {
        this.handleError(e);
        // A rejected/expired token: drop back to the signed-out state.
        if (e && e.code === ERROR_CODES.http && e.status === 401) {
          this.api.clearToken();
          this.user = null;
          this.projects = [];
        }
      } finally {
        this.busy = false;
      }
    },
    async refreshProjects() {
      this.projects = (await this.api.listProjects()) || [];
    },
    saveBackendUrl() {
      this.api.setBaseUrl(this.backendUrlDraft);
      this.isConfigured = this.api.isConfigured();
      this.error = '';
      this.status = this.isConfigured ? 'Backend URL saved.' : 'Backend URL cleared.';
      if (this.api.isLoggedIn()) this.loadSession();
      else { this.user = null; this.projects = []; }
    },
    async submitAuth() {
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        const creds = { email: this.email, password: this.password };
        const data = this.tab === 'register'
          ? await this.api.register(creds)
          : await this.api.login(creds);
        this.user = (data && data.user) || (await this.api.me());
        this.password = '';
        this.status = `Signed in as ${this.user.email}.`;
        await this.refreshProjects();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    signOut() {
      this.api.logout();
      this.user = null;
      this.projects = [];
      this.status = 'Signed out.';
      this.error = '';
    },
    async saveToCloud() {
      if (this.busy) return;
      const graphString = this.$d3Interface ? this.$d3Interface.getGraphJSON() : null;
      if (graphString === null || graphString === undefined) {
        this.error = 'No board to save.';
        return;
      }
      // eslint-disable-next-line no-alert
      const name = window.prompt('Project name', this.defaultProjectName());
      if (name === null) return; // cancelled
      const trimmed = name.trim();
      if (!trimmed) { this.error = 'Please provide a project name.'; return; }
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        const graph = JSON.parse(graphString);
        await this.api.createProject({ name: trimmed, graph });
        await this.refreshProjects();
        this.status = `Saved “${trimmed}” to the cloud.`;
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    async openProject(project) {
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        // Fetch the full project so we always load the latest stored graph.
        const full = await this.api.getProject(project.id);
        const graph = full && full.graph !== undefined ? full.graph : project.graph;
        const graphString = typeof graph === 'string' ? graph : JSON.stringify(graph);
        if (this.$d3Interface) this.$d3Interface.loadGraphFromJSON(graphString);
        this.status = `Opened “${full ? full.name : project.name}”.`;
        this.closeModal();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    async deleteProject(project) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return;
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        await this.api.deleteProject(project.id);
        await this.refreshProjects();
        this.status = `Deleted “${project.name}”.`;
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    defaultProjectName() {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      return `Model ${stamp}`;
    },
    formatDate(value) {
      if (!value) return '';
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    },
    handleError(e) {
      const code = e && e.code;
      if (code === ERROR_CODES.noBackend) {
        this.error = 'Set a backend URL first.';
      } else if (code === ERROR_CODES.notLoggedIn) {
        this.error = 'Please sign in first.';
      } else if (code === ERROR_CODES.network) {
        this.error = 'Could not reach the backend. Is it running?';
      } else if (code === ERROR_CODES.malformed) {
        this.error = 'The backend returned an unexpected response.';
      } else if (e && e.message) {
        this.error = e.message;
      } else {
        this.error = 'Something went wrong.';
      }
    },
    closeModal() {
      this.$emit('close');
    },
    restoreFocus() {
      if (this.previouslyFocused && typeof this.previouslyFocused.focus === 'function') {
        this.previouslyFocused.focus();
      }
      this.previouslyFocused = null;
    },
    handleKeydown(event) {
      if (!this.show) return;
      if (event.key === 'Escape') this.closeModal();
    },
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeydown);
    if (this.show) this.onOpen();
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
  },
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding-top: 40px;
}

.account-container {
  background-color: var(--bg-panel);
  border-radius: var(--border-radius);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
  max-width: 460px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  padding: 28px 32px 32px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
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

.account-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.7em;
  margin: 0 0 4px 0;
}
.subtitle {
  color: var(--text-muted);
  margin: 0 0 18px 0;
  font-size: 0.9em;
}

.section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--panel-border);
}
.section:first-of-type { border-top: none; padding-top: 0; margin-top: 8px; }
.section h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.05em;
  margin: 0 0 12px 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head h2 { margin: 0; }

.field {
  display: block;
  margin-bottom: 10px;
}
.field > span {
  display: block;
  font-size: 0.8em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.field input {
  width: 100%;
  box-sizing: border-box;
  background-color: var(--bg-input);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-family: var(--font-regular);
}
.field input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.account-row { justify-content: space-between; }
.user-email {
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.hint {
  color: var(--text-muted);
  font-size: 0.82em;
  margin: 6px 0 0 0;
}

.btn {
  background-color: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  padding: 7px 14px;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: transform 0.15s ease, background-color 0.15s ease;
}
.btn:hover:not(:disabled) { transform: translate(1px, -1px); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-primary {
  background-color: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
.btn-primary:hover:not(:disabled) { background-color: var(--accent-hover); }
.btn-danger { color: #dc2626; border-color: var(--input-border); }
.btn-danger:hover:not(:disabled) { background-color: rgba(220, 38, 38, 0.1); }

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  padding: 4px 6px;
  cursor: pointer;
  font-family: var(--font-regular);
  font-weight: var(--font-weight-medium);
}
.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.project-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.project-item {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.project-open {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.15s ease;
  color: var(--text-primary);
}
.project-open:hover:not(:disabled) { transform: translate(1px, -1px); }
.project-open:disabled { opacity: 0.5; cursor: default; }
.project-open:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.project-name { font-weight: var(--font-weight-medium); }
.project-date { font-size: 0.78em; color: var(--text-muted); }

.msg {
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85em;
  margin: 0 0 14px 0;
}
.msg-error {
  color: #b91c1c;
  background-color: rgba(220, 38, 38, 0.12);
}
.msg-ok {
  color: var(--success);
  background-color: rgba(22, 163, 74, 0.12);
}

/* Transition animations (match AboutModal) */
.modal-enter-active,
.modal-leave-active { transition: all 0.3s ease-out; }
.modal-enter-active .account-container,
.modal-leave-active .account-container { transition: transform 0.3s ease-out; }
.modal-enter-from .account-container,
.modal-leave-to .account-container { transform: translateY(-100vh); }
</style>
