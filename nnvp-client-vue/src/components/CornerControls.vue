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
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

// import.meta.env is Vite-only (absent under bun/unit tests) — typed locally
// instead of pulling in vite/client types (same choice as BoardInterface.ts).
type ImportMetaWithEnv = ImportMeta & { env?: { VITE_ENABLE_BACKEND?: string } };

// Non-reactive instance field assigned outside data() (pure typing pass:
// keeping it out of data() preserves its non-reactive nature).
interface CornerControlsInstanceExtra { readLogged?: () => void }

export default defineComponent({
  name: 'CornerControls',
  emits: ['open-account', 'open-viz3d'],
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
    // (apiClient dispatches nnvp:auth-changed on token set/clear).
    self.readLogged = () => {
      try {
        this.loggedIn = !!localStorage.getItem('nnvp_backend_token');
      } catch {
        this.loggedIn = false;
      }
    };
    self.readLogged();
    window.addEventListener('nnvp:auth-changed', self.readLogged);
  },
  beforeUnmount() {
    const self = this as unknown as CornerControlsInstanceExtra;
    window.removeEventListener('nnvp:auth-changed', self.readLogged!);
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
