<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div
        ref="container"
        class="modal-surface account-container"
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

          <!-- Approval page: the emailed link landed here (/?magic=<token>).
               A deliberate click approves the browser that REQUESTED the
               login; this browser gets signed in only if it is that browser. -->
          <section v-if="approval" class="section">
            <h2>Approve sign-in</h2>
            <template v-if="approval.done">
              <p class="hint sign-in-hint">
                Done — the browser showing code
                <strong class="match-code-inline">{{ approval.code }}</strong>
                is now signed in. You can close this tab.
              </p>
            </template>
            <template v-else>
              <p v-if="approval.same_browser" class="hint sign-in-hint">
                Approving will sign in <strong>this browser</strong>.
              </p>
              <p v-else class="hint sign-in-hint">
                Approving will sign in the browser showing code
                <strong class="match-code-inline">{{ approval.code }}</strong>
                — {{ approval.requester }}, requested {{ approval.age }}.
                <br/>Check that the codes match; if you did not request this,
                just close this tab.
              </p>
              <div class="row">
                <button class="btn btn-primary" :disabled="busy" @click="approve">
                  Approve sign-in
                </button>
              </div>
            </template>
          </section>

          <!-- Waiting: a link was requested from THIS browser; poll until the
               emailed link is clicked (anywhere) and our token is verified. -->
          <section v-else-if="!user && waiting" class="section">
            <h2>Check your inbox</h2>
            <p class="hint sign-in-hint">
              We emailed a sign-in link to <strong>{{ waiting.email || 'you' }}</strong>.
              Open it on any device and check it shows this code:
            </p>
            <p class="match-code" data-testid="match-code">{{ waiting.code }}</p>
            <div class="row">
              <span class="hint">Waiting for you to click the link…</span>
              <button class="btn" :disabled="busy" @click="cancelWaiting">Cancel</button>
            </div>
          </section>

          <!-- Auth: magic-link only. No password, no registration — the
               account is created on the first verified login. -->
          <section v-else-if="!user" class="section">
            <h2>Sign in</h2>
            <p class="hint sign-in-hint">
              No password needed: we email you a single-use sign-in link.
              Your account is created on first login.
            </p>
            <label class="field">
              <span>Email</span>
              <input
                v-model="email" type="email" autocomplete="email"
                @keydown.enter="sendLink"
              />
            </label>
            <div class="row">
              <button class="btn btn-primary" :disabled="busy" @click="sendLink">
                Email me a sign-in link
              </button>
            </div>
          </section>

          <!-- Signed-in: current user + projects -->
          <template v-if="user">
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
import { clearCurrentProject } from '../../lib/Backend/currentProject';

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
      user: null,
      projects: [],
      email: '',
      // { email, code } while this browser has a pending login being polled.
      waiting: null,
      // { code, requester, age, same_browser, token, done } on the approval page.
      approval: null,
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
      this.previouslyFocused = document.activeElement;
      this.$nextTick(() => {
        const container = this.$refs.container;
        if (container) {
          const focusable = container.querySelector('input, button');
          (focusable || container).focus();
        }
      });
      if (this.intent === 'magic') {
        await this.openApprovalFromUrl();
        return;
      }
      if (this.api.isLoggedIn()) {
        // The stored token may be a full session OR a pending login from a
        // previous visit — the status poll tells us which and carries the
        // match code so the waiting UI is resumable.
        await this.checkStatus();
        if (this.intent === 'save' && this.user) await this.saveToCloud();
      } else {
        this.user = null;
        this.projects = [];
      }
    },
    // The emailed link lands on the SPA as /?magic=<token> (App.vue opens this
    // panel with intent 'magic'). Strip the token from the URL before anything
    // else — it is single-use and must not linger in the address bar/history.
    async openApprovalFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('magic');
      params.delete('magic');
      const query = params.toString();
      window.history.replaceState(
        null, '', `${window.location.pathname}${query ? `?${query}` : ''}`,
      );
      if (!token) return;
      this.busy = true;
      try {
        const info = await this.api.magicInfo(token);
        this.approval = {
          token,
          code: info.code,
          requester: info.requester,
          age: this.formatAge(info.requested_at),
          same_browser: info.same_browser,
          done: false,
        };
      } catch (e) {
        this.handleError(e);
        if (e && e.code === ERROR_CODES.http && e.status === 401) {
          this.error = 'This sign-in link is invalid or has expired. Request a new one.';
        }
      } finally {
        this.busy = false;
      }
    },
    // The deliberate click. Signs in the browser that REQUESTED the login;
    // when that is us (same_browser), our own stored token just got verified.
    async approve() {
      if (this.busy || !this.approval) return;
      this.busy = true;
      this.error = '';
      try {
        await this.api.approveMagicLink(this.approval.token);
        if (this.approval.same_browser) {
          this.approval = null;
          await this.checkStatus();
          this.status = this.user ? `Signed in as ${this.user.email}.` : '';
        } else {
          this.approval.done = true;
        }
      } catch (e) {
        this.handleError(e);
        if (e && e.code === ERROR_CODES.http && e.status === 401) {
          this.error = 'This sign-in link is invalid or has expired. Request a new one.';
        }
      } finally {
        this.busy = false;
      }
    },
    async sendLink() {
      if (this.busy) return;
      const email = this.email.trim();
      if (!email) {
        this.error = 'Please enter your email address.';
        return;
      }
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        const data = await this.api.requestMagicLink(email);
        this.waiting = { email, code: data.code };
        this.startPolling();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    // One status poll; used at panel open and by the waiting loop.
    async checkStatus() {
      try {
        const data = await this.api.authStatus();
        if (data.verified) {
          this.stopPolling();
          this.waiting = null;
          this.user = data.user;
          await this.refreshProjects();
        } else {
          this.waiting = this.waiting || { email: '', code: data.code };
          this.waiting.code = data.code || this.waiting.code;
          this.startPolling();
        }
      } catch (e) {
        if (e && e.code === ERROR_CODES.http && e.status === 401) {
          // Expired pending login (or revoked session): back to square one.
          this.stopPolling();
          this.api.clearToken();
          if (this.waiting) {
            this.waiting = null;
            this.error = 'The sign-in link expired. Request a new one.';
          }
          this.user = null;
          this.projects = [];
        } else {
          this.handleError(e);
        }
      }
    },
    startPolling() {
      if (this.pollTimer) return;
      this.pollTimer = setInterval(() => {
        if (this.show) this.checkStatus();
      }, 2500);
    },
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },
    async cancelWaiting() {
      this.stopPolling();
      await this.api.logout(); // revokes the pending token; the emailed link dies
      this.waiting = null;
      this.status = 'Sign-in cancelled.';
    },
    formatAge(value) {
      const then = new Date(value).getTime();
      if (Number.isNaN(then)) return 'just now';
      const minutes = Math.round((Date.now() - then) / 60000);
      if (minutes <= 0) return 'just now';
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    },
    async refreshProjects() {
      this.projects = (await this.api.listProjects()) || [];
    },
    async signOut() {
      this.stopPolling();
      await this.api.logout();
      clearCurrentProject(); // the continuation anchor belongs to the account
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
      if (code === ERROR_CODES.notLoggedIn) {
        this.error = 'Please sign in first.';
      } else if (code === ERROR_CODES.network) {
        this.error = 'Could not reach the backend. Is it running?';
      } else if (code === ERROR_CODES.http && e.status >= 500) {
        // In dev, vite's /api proxy answers 500 when nothing listens on the
        // backend port (ECONNREFUSED); in prod a reverse proxy answers 502/504.
        this.error = 'The backend is unreachable. Is it running?';
      } else if (code === ERROR_CODES.malformed) {
        this.error = 'The backend returned an unexpected response.';
      } else if (e && e.message) {
        this.error = e.message;
      } else {
        this.error = 'Something went wrong.';
      }
    },
    // Closing the panel is meaningful while a login is in flight: a pending
    // token blocks the app (the modal is forced open, and reopens on refresh),
    // so closing CANCELS the pending login — including from our own approval
    // page (approve or abandon, no limbo). Closing a cross-device approval
    // page touches nothing: that browser holds no token.
    async closeModal() {
      if (this.waiting) {
        await this.cancelWaiting();
      } else if (this.approval && !this.approval.done
          && this.approval.same_browser && this.api.isLoggedIn()) {
        await this.api.logout();
        this.approval = null;
      }
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
  async mounted() {
    document.addEventListener('keydown', this.handleKeydown);
    if (this.show) {
      this.onOpen();
      return;
    }
    // A pending login must survive a page refresh AND block the app: if the
    // stored token turns out to be unverified, ask App.vue to force this
    // panel open (the waiting state + polling resume in onOpen). When the URL
    // carries ?magic= the approval flow takes precedence (App.vue opens the
    // panel with intent 'magic'; approving is what unblocks us anyway).
    if (new URLSearchParams(window.location.search).get('magic')) return;
    if (this.api.isLoggedIn()) {
      try {
        const data = await this.api.authStatus();
        if (!data.verified) this.$emit('pending-login');
      } catch (e) {
        if (e && e.code === ERROR_CODES.http && e.status === 401) {
          this.api.clearToken(); // expired pending leftover: clean slate
        }
      }
    }
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
    this.stopPolling();
  },
};
</script>

<style scoped>
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. */
.account-container {
  max-width: 460px;
  padding: 28px 32px 32px;
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

.sign-in-hint { margin: 0 0 12px 0; }

/* The 4-char pairing code, big enough to compare across two screens. */
.match-code {
  font-family: monospace;
  font-size: 2.2em;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.25em;
  text-align: center;
  margin: 8px 0 14px 0;
  color: var(--text-primary);
}
.match-code-inline {
  font-family: monospace;
  letter-spacing: 0.1em;
}

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

</style>
