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

        <!-- Left nav: one entry per category. Cloud categories render locked
             (not hidden) while signed out — discoverability is the point of
             optional accounts. Without a backend build only the device-local
             categories exist. -->
        <nav class="account-nav" aria-label="Sections">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="account-tab"
            :class="{ active: tab.id === effectiveTab }"
            :disabled="tab.locked"
            :title="tab.locked ? 'Sign in to use' : undefined"
            :aria-current="tab.id === effectiveTab ? 'page' : undefined"
            @click="selectTab(tab.id)"
          >{{ tab.label }}</button>
          <p v-if="backendEnabled && !user" class="account-nav-hint">
            Sign in to unlock Projects &amp; Usage.
          </p>
          <div v-if="user" class="account-nav-foot">
            <span class="user-email">{{ user.email }}</span>
          </div>
        </nav>

        <div class="account-content">
          <h1 id="account-modal-title">{{ activeTitle }}</h1>

          <p v-if="error" class="msg msg-error" role="alert">{{ error }}</p>
          <p v-else-if="status" class="msg msg-ok" role="status">{{ status }}</p>

          <!-- ============ Account (auth flows live here) ============ -->
          <template v-if="effectiveTab === 'account'">
            <p class="subtitle">Optional accounts &amp; saved projects</p>

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

            <section v-else class="section">
              <h2>Account</h2>
              <p class="hint sign-in-hint">Signed in on this browser.</p>
              <div class="row">
                <button class="btn" @click="signOut">Sign out</button>
              </div>
            </section>
          </template>

          <!-- ============ Projects (signed-in only) ============ -->
          <template v-else-if="effectiveTab === 'projects'">
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

          <!-- ============ Usage (signed-in only) ============ -->
          <template v-else-if="effectiveTab === 'usage'">
            <section class="section" ref="usageSection">
              <h2>Credits usage</h2>
              <p class="hint">Assistant tokens used per day, last 14 days.</p>
              <svg
                v-if="usageBars.some(bar => bar.tokens > 0)"
                class="usage-chart"
                viewBox="0 0 280 84"
                role="img"
                aria-label="Daily assistant token usage"
              >
                <g v-for="(bar, index) in usageBars" :key="bar.date">
                  <rect
                    class="usage-bar"
                    :x="index * 20 + 3"
                    :y="70 - bar.height"
                    width="14"
                    :height="Math.max(bar.height, bar.tokens > 0 ? 2 : 0)"
                    rx="2"
                  >
                    <title>{{ bar.date }}: {{ bar.tokens }} tokens ({{ bar.requests }} requests)</title>
                  </rect>
                </g>
                <text class="usage-label" x="3" y="82">{{ usageBars[0].date.slice(5) }}</text>
                <text class="usage-label" x="277" y="82" text-anchor="end">today</text>
              </svg>
              <p v-else class="hint">No assistant usage yet.</p>
            </section>
          </template>

          <!-- ============ Settings (device-local, account or not) ============ -->
          <template v-else-if="effectiveTab === 'settings'">
            <section class="section" ref="settingsSection">
              <p class="hint">Stored on this device.</p>
              <h3 class="settings-subtitle">Activation colors</h3>
              <p class="hint">The color ramp used wherever activations are shown —
              the inspect overlays on the board and the 3D view. Viridis is the
              colorblind-safe choice.</p>
              <label v-for="scheme in schemes" :key="scheme.id" class="settings-scheme">
                <input
                  type="radio"
                  name="colorScheme"
                  :value="scheme.id"
                  :checked="scheme.id === colorScheme"
                  @change="setColorScheme(scheme.id)"
                />
                <span class="settings-scheme-body">
                  <span class="settings-scheme-label">{{ scheme.label }}</span>
                  <span class="settings-scheme-swatch" :style="{ background: gradientOf(scheme) }"></span>
                  <span class="settings-scheme-description">{{ scheme.description }}</span>
                </span>
              </label>
              <h3 class="settings-subtitle">Training engine</h3>
              <p class="hint">Where the in-browser trainer runs. The Web Worker
              engine keeps the page responsive while training and runs the
              generated model code off the main thread; the Inspect tab's
              activation probes are not available with it yet.</p>
              <label v-for="engine in trainingEngines" :key="engine.id" class="settings-scheme">
                <input
                  type="radio"
                  name="trainingEngine"
                  :value="engine.id"
                  :checked="engine.id === trainingEngine"
                  @change="setTrainingEngine(engine.id)"
                />
                <span class="settings-scheme-body">
                  <span class="settings-scheme-label">{{ engine.label }}</span>
                  <span class="settings-scheme-description">{{ engine.description }}</span>
                </span>
              </label>
            </section>
          </template>

        </div>
      </div>
    </div>
  </Transition>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ApiClient, { ERROR_CODES } from '../../lib/Backend/apiClient';
import { COLOR_SCHEMES, rampGradientCss } from '../../lib/Settings/colorSchemes';
import type { ColorScheme, ColorSchemeId } from '../../lib/Settings/colorSchemes';
import { settings } from '../../lib/Settings/settings';
import type { TrainingEngineChoice } from '../../lib/Settings/settings';
import { clearCurrentProject } from '../../lib/Backend/currentProject';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as CornerControls.vue).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

interface ApiUser { email: string }

/** The left-nav categories. Cloud tabs need a backend build; projects/usage
 *  additionally need a session (they render locked while signed out). */
type TabId = 'account' | 'projects' | 'usage' | 'settings';

interface TabDef {
  id: TabId;
  label: string;
  title: string;
  locked: boolean;
}

/** Project rows as the backend returns them (list / get). */
interface ProjectRecord {
  id: number;
  name: string;
  updated_at?: string;
  graph?: unknown;
}

/** One row of api.getAssistantUsage().days. */
interface UsageDay {
  date: string;
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

interface UsageBar {
  date: string;
  tokens: number;
  requests: number;
  height: number;
}

/** Pending login being polled from THIS browser. */
interface Waiting { email: string; code?: string }

/** State of the approval page (/?magic=<token>). */
interface Approval {
  token: string;
  code: string;
  requester: string;
  age: string;
  same_browser: boolean;
  done: boolean;
}

/** Errors surfaced by ApiClient (ApiError-shaped), read defensively. */
interface ApiErrorLike {
  code?: string;
  status?: number | null;
  message?: string;
}

// Non-reactive instance state, assigned in created()/onOpen() (not data()) on
// purpose — see the comments there. Typed through the `self` cast below — a
// typing-only view, self === this.
interface AccountPanelInternal {
  api: ApiClient;
  pollTimer?: ReturnType<typeof setInterval> | null;
  previouslyFocused?: HTMLElement | null;
}

export default defineComponent({
  name: 'AccountPanel',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    // Optional intent when opened: 'save' | 'usage' | 'settings' | 'about' |
    // 'magic' — picks the tab (and for 'save', immediately saves the board).
    intent: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      // Without a backend build the panel still exists — it is where the
      // device-local Settings and About categories live.
      backendEnabled: !!(import.meta as ImportMetaWithEnv).env?.VITE_ENABLE_BACKEND,
      selectedTab: 'account' as TabId,
      user: null as ApiUser | null,
      projects: [] as ProjectRecord[],
      usageDays: [] as UsageDay[],
      schemes: Object.values(COLOR_SCHEMES),
      colorScheme: settings.get('colorScheme'),
      trainingEngine: settings.get('trainingEngine'),
      trainingEngines: [
        {
          id: 'tfjs' as TrainingEngineChoice,
          label: 'Main thread (default)',
          description: 'The historical in-page trainer. Needed for the Inspect tab\'s activation views.',
        },
        {
          id: 'tfjs-worker' as TrainingEngineChoice,
          label: 'Web Worker (experimental)',
          description: 'Trains in a background worker: the page stays responsive and generated code runs isolated from it.',
        },
      ],
      email: '',
      // { email, code } while this browser has a pending login being polled.
      waiting: null as Waiting | null,
      // { code, requester, age, same_browser, token, done } on the approval page.
      approval: null as Approval | null,
      busy: false,
      error: '',
      status: '',
    };
  },
  created() {
    // Non-reactive client; reads url/token from localStorage on every call.
    (this as typeof this & AccountPanelInternal).api = new ApiClient();
  },
  watch: {
    show(isOpen: boolean) {
      if (isOpen) this.onOpen();
      else this.restoreFocus();
    },
  },
  computed: {
    tabs(): TabDef[] {
      const needsUser = !this.user;
      const cloud: TabDef[] = [
        { id: 'account', label: 'Account', title: 'Cloud', locked: false },
        { id: 'projects', label: 'Projects', title: 'Projects', locked: needsUser },
        { id: 'usage', label: 'Usage', title: 'Usage', locked: needsUser },
      ];
      const local: TabDef[] = [
        { id: 'settings', label: 'Settings', title: 'Settings', locked: false },
      ];
      return this.backendEnabled ? [...cloud, ...local] : local;
    },
    // The tab actually shown: auth flows pin the Account tab, a locked or
    // unavailable selection falls back to the nearest sensible tab (so e.g. a
    // sign-out from the Projects tab cannot strand an empty panel).
    effectiveTab(): TabId {
      if (!this.backendEnabled) return 'settings';
      if (this.approval || this.waiting) return 'account';
      if ((this.selectedTab === 'projects' || this.selectedTab === 'usage') && !this.user) {
        return 'account';
      }
      return this.selectedTab;
    },
    activeTitle(): string {
      const tab = this.tabs.find(entry => entry.id === this.effectiveTab);
      return tab ? tab.title : 'Cloud';
    },
    // Last 14 days, gaps filled, scaled to the busiest day (svg is 70 tall).
    // Always exactly 14 entries, so the non-empty tuple type is sound (the
    // template reads usageBars[0] directly).
    usageBars(): [UsageBar, ...UsageBar[]] {
      const byDate = new Map(this.usageDays.map(day => [day.date, day] as [string, UsageDay]));
      const bars = [];
      for (let i = 13; i >= 0; i -= 1) {
        const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const row = byDate.get(date);
        bars.push({
          date,
          tokens: row ? row.input_tokens + row.output_tokens : 0,
          requests: row ? row.requests : 0,
        });
      }
      const top = Math.max(1, ...bars.map(bar => bar.tokens));
      return bars.map(
        bar => ({ ...bar, height: Math.round((bar.tokens / top) * 66) }),
      ) as [UsageBar, ...UsageBar[]];
    },
  },
  methods: {
    selectTab(id: TabId) {
      this.selectedTab = id;
    },
    /** The tab an open-intent lands on; 'save'/'usage' degrade through
     *  effectiveTab to Account while signed out. */
    intentTab(): TabId {
      if (this.intent === 'settings') return 'settings';
      if (this.intent === 'usage') return 'usage';
      if (this.intent === 'save') return 'projects';
      if (this.intent === 'magic') return 'account';
      // The plain person-button open: your stuff when signed in, sign-in
      // otherwise.
      return this.user ? 'projects' : 'account';
    },
    async onOpen() {
      const self = this as typeof this & AccountPanelInternal;
      this.error = '';
      this.status = '';
      self.previouslyFocused = document.activeElement as HTMLElement | null;
      this.$nextTick(() => {
        const container = this.$refs.container as HTMLElement | undefined;
        if (container) {
          const focusable = container.querySelector<HTMLElement>('input, button');
          (focusable || container).focus();
        }
      });
      if (!this.backendEnabled) {
        this.selectedTab = this.intentTab();
        return;
      }
      if (this.intent === 'magic') {
        this.selectedTab = 'account';
        await this.openApprovalFromUrl();
        return;
      }
      if (self.api.isLoggedIn()) {
        // The stored token may be a full session OR a pending login from a
        // previous visit — the status poll tells us which and carries the
        // match code so the waiting UI is resumable.
        await this.checkStatus();
        if (this.intent === 'save' && this.user) await this.saveToCloud();
        if (this.user) await this.refreshUsage();
      } else {
        this.user = null;
        this.projects = [];
      }
      this.selectedTab = this.intentTab();
    },
    // The emailed link lands on the SPA as /?magic=<token> (App.vue opens this
    // panel with intent 'magic'). Strip the token from the URL before anything
    // else — it is single-use and must not linger in the address bar/history.
    async openApprovalFromUrl() {
      const self = this as typeof this & AccountPanelInternal;
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
        const info = await self.api.magicInfo(token) as {
          code: string; requester: string; requested_at: string; same_browser: boolean;
        };
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
        const err = e as ApiErrorLike | null | undefined;
        if (err && err.code === ERROR_CODES.http && err.status === 401) {
          this.error = 'This sign-in link is invalid or has expired. Request a new one.';
        }
      } finally {
        this.busy = false;
      }
    },
    // The deliberate click. Signs in the browser that REQUESTED the login;
    // when that is us (same_browser), our own stored token just got verified.
    async approve() {
      const self = this as typeof this & AccountPanelInternal;
      if (this.busy || !this.approval) return;
      this.busy = true;
      this.error = '';
      try {
        await self.api.approveMagicLink(this.approval.token);
        if (this.approval.same_browser) {
          this.approval = null;
          await this.checkStatus();
          this.status = this.user ? `Signed in as ${this.user.email}.` : '';
          // A fresh interactive sign-in lands on your stuff.
          if (this.user) this.selectedTab = 'projects';
        } else {
          this.approval.done = true;
        }
      } catch (e) {
        this.handleError(e);
        const err = e as ApiErrorLike | null | undefined;
        if (err && err.code === ERROR_CODES.http && err.status === 401) {
          this.error = 'This sign-in link is invalid or has expired. Request a new one.';
        }
      } finally {
        this.busy = false;
      }
    },
    async sendLink() {
      const self = this as typeof this & AccountPanelInternal;
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
        const data = await self.api.requestMagicLink(email);
        this.waiting = { email, code: data!.code };
        this.startPolling();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    // One status poll; used at panel open and by the waiting loop.
    async checkStatus() {
      const self = this as typeof this & AccountPanelInternal;
      const wasWaiting = Boolean(this.waiting);
      try {
        const data = await self.api.authStatus() as {
          verified?: boolean; user?: ApiUser; code?: string;
        };
        if (data.verified) {
          this.stopPolling();
          this.waiting = null;
          this.user = data.user!;
          await this.refreshProjects();
          // The waited-for sign-in just completed: land on your stuff.
          if (wasWaiting) this.selectedTab = 'projects';
        } else {
          this.waiting = this.waiting || { email: '', code: data.code };
          this.waiting.code = data.code || this.waiting.code;
          this.startPolling();
        }
      } catch (e) {
        const err = e as ApiErrorLike | null | undefined;
        if (err && err.code === ERROR_CODES.http && err.status === 401) {
          // Expired pending login (or revoked session): back to square one.
          this.stopPolling();
          self.api.clearToken();
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
      const self = this as typeof this & AccountPanelInternal;
      if (self.pollTimer) return;
      self.pollTimer = setInterval(() => {
        if (this.show) this.checkStatus();
      }, 2500);
    },
    stopPolling() {
      const self = this as typeof this & AccountPanelInternal;
      if (self.pollTimer) {
        clearInterval(self.pollTimer);
        self.pollTimer = null;
      }
    },
    async cancelWaiting() {
      const self = this as typeof this & AccountPanelInternal;
      this.stopPolling();
      await self.api.logout(); // revokes the pending token; the emailed link dies
      this.waiting = null;
      this.status = 'Sign-in cancelled.';
    },
    formatAge(value: string): string {
      const then = new Date(value).getTime();
      if (Number.isNaN(then)) return 'just now';
      const minutes = Math.round((Date.now() - then) / 60000);
      if (minutes <= 0) return 'just now';
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    },
    setColorScheme(id: ColorSchemeId) {
      settings.set('colorScheme', id);
      this.colorScheme = id;
    },
    setTrainingEngine(id: TrainingEngineChoice) {
      settings.set('trainingEngine', id);
      this.trainingEngine = id;
    },
    gradientOf(scheme: ColorScheme): string {
      return rampGradientCss(scheme);
    },
    async refreshUsage() {
      const self = this as typeof this & AccountPanelInternal;
      try {
        const data = await self.api.getAssistantUsage(14) as { days?: UsageDay[] } | null;
        this.usageDays = (data && data.days) || [];
      } catch {
        this.usageDays = []; // the graph is informational — never block the panel
      }
    },
    async refreshProjects() {
      const self = this as typeof this & AccountPanelInternal;
      this.projects = ((await self.api.listProjects()) || []) as ProjectRecord[];
    },
    async signOut() {
      const self = this as typeof this & AccountPanelInternal;
      this.stopPolling();
      await self.api.logout();
      clearCurrentProject(); // the continuation anchor belongs to the account
      this.user = null;
      this.projects = [];
      this.status = 'Signed out.';
      this.error = '';
    },
    async saveToCloud() {
      const self = this as typeof this & AccountPanelInternal;
      if (this.busy) return;
      const graphString = this.$boardInterface ? this.$boardInterface.getGraphJSON() : null;
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
        await self.api.createProject({ name: trimmed, graph });
        await this.refreshProjects();
        this.status = `Saved “${trimmed}” to the cloud.`;
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    async openProject(project: ProjectRecord) {
      const self = this as typeof this & AccountPanelInternal;
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        // Fetch the full project so we always load the latest stored graph.
        const full = await self.api.getProject(project.id) as ProjectRecord | null;
        const graph = full && full.graph !== undefined ? full.graph : project.graph;
        const graphString = typeof graph === 'string' ? graph : JSON.stringify(graph);
        if (this.$boardInterface) this.$boardInterface.loadGraphFromJSON(graphString);
        this.status = `Opened “${full ? full.name : project.name}”.`;
        this.closeModal();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    async deleteProject(project: ProjectRecord) {
      const self = this as typeof this & AccountPanelInternal;
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return;
      this.busy = true;
      this.error = '';
      this.status = '';
      try {
        await self.api.deleteProject(project.id);
        await this.refreshProjects();
        this.status = `Deleted “${project.name}”.`;
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    defaultProjectName(): string {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      return `Model ${stamp}`;
    },
    formatDate(value: string | undefined): string {
      if (!value) return '';
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    },
    handleError(e: unknown) {
      const err = e as ApiErrorLike | null | undefined;
      const code = err && err.code;
      if (code === ERROR_CODES.notLoggedIn) {
        this.error = 'Please sign in first.';
      } else if (code === ERROR_CODES.network) {
        this.error = 'Can\'t reach the server — please check your internet connection and try again.';
      } else if (code === ERROR_CODES.http && (err!.status as number) >= 500) {
        // In dev, vite's /api proxy answers 500 when nothing listens on the
        // backend port (ECONNREFUSED); in prod a reverse proxy answers 502/504.
        this.error = 'The server isn\'t responding right now — please try again in a moment.';
      } else if (code === ERROR_CODES.malformed) {
        this.error = 'The backend returned an unexpected response.';
      } else if (err && err.message) {
        this.error = err.message;
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
      const self = this as typeof this & AccountPanelInternal;
      if (this.waiting) {
        await this.cancelWaiting();
      } else if (this.approval && !this.approval.done
          && this.approval.same_browser && self.api.isLoggedIn()) {
        await self.api.logout();
        this.approval = null;
      }
      this.$emit('close');
    },
    restoreFocus() {
      const self = this as typeof this & AccountPanelInternal;
      if (self.previouslyFocused && typeof self.previouslyFocused.focus === 'function') {
        self.previouslyFocused.focus();
      }
      self.previouslyFocused = null;
    },
    handleKeydown(event: KeyboardEvent) {
      if (!this.show) return;
      if (event.key === 'Escape') this.closeModal();
      else if (event.key === 'Tab') this.trapFocus(event);
    },
    // Keep Tab/Shift+Tab cycling inside the dialog (the same focus-trap
    // contract as AboutModal).
    trapFocus(event: KeyboardEvent) {
      const container = this.$refs.container as HTMLElement | undefined;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
  },
  async mounted() {
    const self = this as typeof this & AccountPanelInternal;
    document.addEventListener('keydown', this.handleKeydown);
    if (this.show) {
      this.onOpen();
      return;
    }
    if (!this.backendEnabled) return;
    // A pending login must survive a page refresh AND block the app: if the
    // stored token turns out to be unverified, ask App.vue to force this
    // panel open (the waiting state + polling resume in onOpen). When the URL
    // carries ?magic= the approval flow takes precedence (App.vue opens the
    // panel with intent 'magic'; approving is what unblocks us anyway).
    if (new URLSearchParams(window.location.search).get('magic')) return;
    if (self.api.isLoggedIn()) {
      try {
        const data = await self.api.authStatus() as { verified?: boolean };
        if (!data.verified) this.$emit('pending-login');
      } catch (e) {
        const err = e as ApiErrorLike | null | undefined;
        if (err && err.code === ERROR_CODES.http && err.status === 401) {
          self.api.clearToken(); // expired pending leftover: clean slate
        }
      }
    }
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
    this.stopPolling();
  },
});
</script>

<style scoped>
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. The surface is a
   nav+content row: the CONTENT column scrolls, the surface itself must not. */
.account-container {
  max-width: 680px;
  padding: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  /* One stable height for every tab (no jumping when content changes):
     560px preferred, never below 65% nor above 90% of the viewport — the
     content column scrolls to absorb the difference. Overrides the global
     modal-surface 85vh cap. */
  height: clamp(65vh, 560px, 90vh);
  max-height: 90vh;
}

.account-nav {
  flex: none;
  width: 148px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 22px 12px 16px;
  border-right: 1px solid var(--panel-border);
  background-color: var(--bg-elevated);
  box-sizing: border-box;
}
.account-tab {
  text-align: left;
  padding: 7px 12px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-primary);
  font-family: var(--font-regular);
  font-weight: var(--font-weight-medium);
  font-size: 13px;
  cursor: pointer;
}
.account-tab:hover:not(:disabled):not(.active) { background-color: var(--bg-hover); }
.account-tab.active {
  background-color: var(--fill-strong);
  color: var(--fill-strong-text);
}
.account-tab:disabled { color: var(--text-muted); opacity: 0.55; cursor: default; }
.account-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.account-nav-hint {
  margin: 8px 4px 0;
  font-size: 11px;
  color: var(--text-muted);
}
.account-nav-foot {
  margin-top: auto;
  padding: 10px 4px 0;
  border-top: 1px solid var(--panel-border);
  font-size: 11px;
  color: var(--text-muted);
}

.account-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 30px 30px;
  box-sizing: border-box;
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

.settings-subtitle {
  margin: 10px 0 4px;
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
}
.settings-scheme {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
}
.settings-scheme input { margin-top: 3px; }
.settings-scheme-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.settings-scheme-label { font-weight: var(--font-weight-semibold); }
.settings-scheme-swatch {
  display: block;
  width: 180px;
  height: 10px;
  border-radius: 5px;
  border: 1px solid var(--panel-border);
}
.settings-scheme-description {
  color: var(--text-muted);
  font-size: 12px;
}

.usage-chart {
  width: 100%;
  max-width: 320px;
  display: block;
  margin: 4px 0 10px;
}
.usage-bar {
  fill: var(--accent);
  opacity: 0.85;
}
.usage-bar:hover { opacity: 1; }
.usage-label {
  font-size: 8px;
  fill: var(--text-muted);
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
