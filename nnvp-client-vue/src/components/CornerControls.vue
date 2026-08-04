<template>
  <div id="CornerControls" class="corner-controls">
    <button
      type="button"
      class="corner-btn theme-toggle-btn"
      title="Toggle light / dark theme"
      aria-label="Toggle light / dark theme"
      @click="toggleTheme"
    >
      <svg v-if="theme === 'dark'" class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
        <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="2" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="22" y2="12"/>
          <line x1="4.6" y1="4.6" x2="6.4" y2="6.4"/><line x1="17.6" y1="17.6" x2="19.4" y2="19.4"/>
          <line x1="4.6" y1="19.4" x2="6.4" y2="17.6"/><line x1="17.6" y1="6.4" x2="19.4" y2="4.6"/>
        </g>
      </svg>
      <svg v-else class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="corner-btn viz3d-btn"
      title="3D network view (experimental)"
      aria-label="3D network view (experimental)"
      @click="$emit('open-viz3d')"
    >
      <svg class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9z"/>
          <path d="M3 7.5l9 5 9-5M12 12.5v9"/>
        </g>
      </svg>
    </button>
    <button
      v-if="backendEnabled"
      type="button"
      class="corner-btn chat-btn"
      title="Assistant chat"
      aria-label="Assistant chat"
      @click="$emit('toggle-chat')"
    >
      <svg class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M21 12a8 8 0 0 1-8 8H5.5L3 22V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="corner-btn settings-btn"
      title="Settings"
      aria-label="Settings"
      @click="$emit('open-settings')"
    >
      <svg class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </g>
      </svg>
    </button>
    <button
      v-if="backendEnabled"
      type="button"
      class="corner-btn account-btn"
      :class="loggedIn ? 'logged-in' : 'logged-out'"
      :title="loggedIn ? 'Account' : 'Account — not signed in'"
      :aria-label="loggedIn ? 'Account' : 'Account — not signed in'"
      @click="$emit('open-account')"
    >
      <svg class="corner-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M4 20c1.8-3.6 4.7-5.4 8-5.4s6.2 1.8 8 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span v-if="!loggedIn" class="account-status" aria-hidden="true">?</span>
      <span class="visually-hidden">Account</span>
    </button>
    <!-- The help spot: About sits at the extreme right of the top bar. -->
    <button
      type="button"
      class="corner-btn about-btn"
      title="About NNVP"
      aria-label="About NNVP"
      @click="$emit('open-about')"
    >
      <svg class="corner-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
        <path
          d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.9c-.8.3-1 .9-1 1.7"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        />
        <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="currentColor" stroke-width="1"/>
      </svg>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { bus } from '../lib/Events/bus';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

// Non-reactive instance fields assigned outside data() (pure typing pass:
// keeping them out of data() preserves their non-reactive nature).
interface CornerControlsInstanceExtra {
  readLogged?: () => void;
  offAuthChanged?: () => void;
}

export default defineComponent({
  name: 'CornerControls',
  emits: ['open-about', 'open-account', 'open-settings', 'open-viz3d', 'toggle-chat'],
  data() {
    return {
      backendEnabled: !!(import.meta as ImportMetaWithEnv).env?.VITE_ENABLE_BACKEND,
      loggedIn: false,
      theme: 'light',
    };
  },
  created() {
    // Reflect the effective theme so the toggle shows the right icon. An
    // explicit choice (data-theme) wins; otherwise fall back to the OS setting.
    const explicit = document.documentElement.dataset.theme;
    if (explicit === 'dark' || explicit === 'light') {
      this.theme = explicit;
    } else if (window.matchMedia
        && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.theme = 'dark';
    }
  },
  mounted() {
    const self = this as unknown as CornerControlsInstanceExtra;
    // Person-icon state: token presence now + on every auth change
    // (apiClient emits 'auth.changed' on the bus on token set/clear).
    self.readLogged = () => {
      try {
        this.loggedIn = !!localStorage.getItem('nnvp_backend_token');
      } catch {
        this.loggedIn = false;
      }
    };
    self.readLogged();
    self.offAuthChanged = bus.on('auth.changed', self.readLogged);
  },
  beforeUnmount() {
    const self = this as unknown as CornerControlsInstanceExtra;
    self.offAuthChanged!();
  },
  methods: {
    toggleTheme() {
      const root = document.documentElement;
      const current = root.dataset.theme
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      this.theme = next;
      try {
        localStorage.setItem('nnvp-theme', next);
      } catch { /* localStorage unavailable (private mode) */ }
    },
  },
});
</script>

<style scoped>
.corner-controls {
  display: flex;
  align-items: center;
  height: 100%;
}
.corner-btn {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 9px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.corner-btn:hover { transform: translate(1px, -1px); }
.corner-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 8px;
}
.corner-icon { display: block; }
/* Signed out: amber icon + a small "?" so the state is obvious at a glance. */
.account-btn.logged-out { color: #d97706; }
.account-status {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  margin-left: 2px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
