<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div
        ref="container"
        class="modal-surface saveload-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saveload-title"
        tabindex="-1"
        @click.stop
      >
        <button class="modal-close" @click="closeModal" aria-label="Close">&times;</button>

        <div class="saveload-content">
          <h1 id="saveload-title">{{ mode === 'save' ? 'Save model' : 'Load model' }}</h1>

          <p v-if="error" class="msg msg-error" role="alert">{{ error }}</p>
          <p v-else-if="status" class="msg msg-ok" role="status">{{ status }}</p>

          <!-- Signed out: local file front and center, cloud as the pitch. -->
          <template v-if="!signedIn">
            <section class="section">
              <div class="row">
                <button class="btn btn-primary" @click="useDevice">
                  {{ mode === 'save' ? 'Save to this device' : 'Load from this device' }}
                </button>
              </div>
            </section>
            <section class="section">
              <h2>Or use the cloud</h2>
              <p class="hint">
                With a free account your models are saved online, keep their
                history as a graph of continuations, and can be tagged and
                searched. No password — sign-in links by email.
              </p>
              <div class="row">
                <button class="btn" @click="goSignIn">Sign in</button>
              </div>
            </section>
          </template>

          <!-- Signed in, SAVE: continuation of the current state by default. -->
          <template v-else-if="mode === 'save'">
            <section class="section">
              <label class="field">
                <span>Name</span>
                <input v-model="saveName" type="text" @keydown.enter="saveToCloud" />
              </label>
              <label class="field">
                <span>Tags (comma-separated)</span>
                <input v-model="saveTags" type="text" placeholder="mnist, cnn, experiment" />
              </label>
              <p v-if="continuationOf" class="hint">
                Will be saved as a continuation of
                <strong>{{ continuationOf.name || `#${continuationOf.id}` }}</strong>.
              </p>
              <p v-else class="hint">
                First save of this board — it starts a new history.
              </p>
              <div class="row">
                <button class="btn btn-primary" :disabled="busy" @click="saveToCloud">
                  Save to cloud
                </button>
                <button class="btn" :disabled="busy" @click="useDevice">
                  Save to this device instead
                </button>
              </div>
            </section>
          </template>

          <!-- Signed in, LOAD: searchable list + localized lineage graph. -->
          <template v-else>
            <section class="section">
              <label class="field">
                <span>Search (name or tag)</span>
                <input v-model="search" type="search" placeholder="mnist" />
              </label>
              <p v-if="filteredProjects.length === 0" class="hint">
                {{ projects.length === 0 ? 'No saved models yet.' : 'Nothing matches the search.' }}
              </p>
              <ul v-else class="project-list">
                <li v-for="p in filteredProjects" :key="p.id">
                  <button
                    class="project-row"
                    :class="{ selected: selectedId === p.id }"
                    :disabled="busy"
                    @click="select(p.id)"
                  >
                    <span class="project-name">{{ p.name }}</span>
                    <span v-if="p.tags && p.tags.length" class="project-tags">
                      <span v-for="tag in p.tags" :key="tag" class="tag">{{ tag }}</span>
                    </span>
                    <span class="project-date">{{ formatDate(p.updated_at) }}</span>
                  </button>
                </li>
              </ul>
            </section>

            <!-- Localized history: ancestors/descendants of the selection,
                 2 levels each way. Clicking a node refocuses the window. -->
            <section v-if="lineage && lineage.nodes.length > 1" class="section">
              <h2>History around this save</h2>
              <svg
                class="lineage-graph"
                :viewBox="`0 0 ${lineageLayout.width} ${lineageLayout.height}`"
                data-testid="lineage-graph"
              >
                <line
                  v-for="(edge, i) in lineageLayout.edges"
                  :key="'e' + i"
                  :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
                  class="lineage-edge"
                />
                <g
                  v-for="node in lineageLayout.nodes"
                  :key="node.id"
                  class="lineage-node"
                  :class="{ focus: node.id === lineage.focus }"
                  role="button"
                  :aria-label="'Focus on ' + node.name"
                  @click="select(node.id)"
                >
                  <rect :x="node.x" :y="node.y" :width="node.w" :height="node.h" rx="7" />
                  <text :x="node.x + node.w / 2" :y="node.y + node.h / 2 + 4">{{ node.label }}</text>
                </g>
              </svg>
            </section>

            <section class="section">
              <div class="row">
                <button class="btn btn-primary" :disabled="busy || selectedId === null" @click="openSelected">
                  Open selected
                </button>
                <button class="btn" :disabled="busy" @click="useDevice">
                  Load from this device
                </button>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script>
import ApiClient, { ERROR_CODES } from '../../lib/Backend/apiClient';
import {
  getCurrentProject, setCurrentProject, clearCurrentProject,
} from '../../lib/Backend/currentProject';

const NODE_W = 108;
const NODE_H = 26;
const COL_GAP = 20;
const ROW_GAP = 10;

export default {
  name: 'SaveLoadModal',
  props: {
    show: { type: Boolean, required: true },
    mode: { type: String, default: 'load' }, // 'save' | 'load'
  },
  emits: ['close', 'open-account'],
  data() {
    return {
      signedIn: false,
      projects: [],
      search: '',
      selectedId: null,
      lineage: null,
      saveName: '',
      saveTags: '',
      continuationOf: null,
      busy: false,
      error: '',
      status: '',
    };
  },
  created() {
    this.api = new ApiClient();
  },
  watch: {
    show(isOpen) {
      if (isOpen) this.onOpen();
    },
  },
  computed: {
    filteredProjects() {
      const needle = this.search.trim().toLowerCase();
      if (!needle) return this.projects;
      return this.projects.filter(p => p.name.toLowerCase().includes(needle)
        || (p.tags || []).some(tag => String(tag).toLowerCase().includes(needle)));
    },
    // Columns by generation (-2..+2 relative to the focus), rows within.
    lineageLayout() {
      if (!this.lineage) return { nodes: [], edges: [], width: 0, height: 0 };
      const depth = new Map([[this.lineage.focus, 0]]);
      const parentOf = new Map(this.lineage.edges.map(e => [e.target, e.source]));
      const childrenOf = new Map();
      this.lineage.edges.forEach((e) => {
        if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
        childrenOf.get(e.source).push(e.target);
      });
      // Walk up then down from the focus (the backend guarantees ≤2 each way).
      let cursor = this.lineage.focus;
      for (let d = -1; parentOf.has(cursor); d -= 1) {
        cursor = parentOf.get(cursor);
        depth.set(cursor, d);
      }
      const walkDown = (id) => {
        (childrenOf.get(id) || []).forEach((child) => {
          if (!depth.has(child)) depth.set(child, depth.get(id) + 1);
          walkDown(child);
        });
      };
      walkDown(this.lineage.focus);
      if (parentOf.has(this.lineage.focus)) walkDown(parentOf.get(this.lineage.focus));

      const depths = [...new Set(depth.values())].sort((a, b) => a - b);
      const columnIndex = new Map(depths.map((d, i) => [d, i]));
      const rows = new Map(); // columnIndex -> next row
      const placed = new Map();
      const nodes = this.lineage.nodes
        .filter(n => depth.has(n.id))
        .map((n) => {
          const col = columnIndex.get(depth.get(n.id));
          const row = rows.get(col) || 0;
          rows.set(col, row + 1);
          const node = {
            id: n.id,
            name: n.name,
            label: n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name,
            x: col * (NODE_W + COL_GAP),
            y: row * (NODE_H + ROW_GAP),
            w: NODE_W,
            h: NODE_H,
          };
          placed.set(n.id, node);
          return node;
        });
      const edges = this.lineage.edges
        .filter(e => placed.has(e.source) && placed.has(e.target))
        .map(e => ({
          x1: placed.get(e.source).x + NODE_W,
          y1: placed.get(e.source).y + NODE_H / 2,
          x2: placed.get(e.target).x,
          y2: placed.get(e.target).y + NODE_H / 2,
        }));
      return {
        nodes,
        edges,
        width: depths.length * (NODE_W + COL_GAP) - COL_GAP,
        height: Math.max(...rows.values(), 1) * (NODE_H + ROW_GAP) - ROW_GAP,
      };
    },
  },
  methods: {
    async onOpen() {
      this.error = '';
      this.status = '';
      this.search = '';
      this.selectedId = null;
      this.lineage = null;
      this.busy = false;
      this.signedIn = false;
      this.continuationOf = getCurrentProject();
      this.saveTags = '';
      this.saveName = this.defaultName();
      this.$nextTick(() => {
        const el = this.$refs.container && this.$refs.container.querySelector('input, button');
        if (el) el.focus();
      });
      if (!this.api.isLoggedIn()) return;
      try {
        const statusData = await this.api.authStatus();
        this.signedIn = !!statusData.verified;
        if (this.signedIn && this.mode === 'load') {
          this.projects = (await this.api.listProjects()) || [];
        }
      } catch {
        this.signedIn = false; // pending/expired token: treat as signed out
      }
    },
    defaultName() {
      const current = getCurrentProject();
      if (current && current.name) return current.name;
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      return `Model ${stamp}`;
    },
    async select(id) {
      this.selectedId = id;
      try {
        this.lineage = await this.api.projectLineage(id);
      } catch (e) {
        this.lineage = null;
        this.handleError(e);
      }
    },
    async saveToCloud() {
      if (this.busy) return;
      const name = this.saveName.trim();
      if (!name) {
        this.error = 'Please provide a name.';
        return;
      }
      const graphString = this.$d3Interface ? this.$d3Interface.getGraphJSON() : null;
      if (!graphString) {
        this.error = 'No board to save.';
        return;
      }
      this.busy = true;
      this.error = '';
      try {
        const created = await this.api.createProject({
          name,
          graph: JSON.parse(graphString),
          tags: this.saveTags.split(',').map(tag => tag.trim()).filter(Boolean),
          parent: this.continuationOf ? this.continuationOf.id : null,
        });
        setCurrentProject(created);
        this.continuationOf = getCurrentProject();
        this.status = `Saved “${created.name}” to the cloud.`;
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    async openSelected() {
      if (this.busy || this.selectedId === null) return;
      this.busy = true;
      this.error = '';
      try {
        const full = await this.api.getProject(this.selectedId);
        const graph = typeof full.graph === 'string' ? full.graph : JSON.stringify(full.graph);
        if (this.$d3Interface) this.$d3Interface.loadGraphFromJSON(graph);
        setCurrentProject(full);
        this.closeModal();
      } catch (e) {
        this.handleError(e);
      } finally {
        this.busy = false;
      }
    },
    useDevice() {
      // Device files know nothing about cloud lineage: a local load resets the
      // continuation anchor.
      if (this.mode === 'save') {
        this.$d3Interface.saveBoard();
      } else {
        clearCurrentProject();
        this.$d3Interface.loadBoard();
      }
      this.closeModal();
    },
    goSignIn() {
      this.closeModal();
      this.$emit('open-account');
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
      } else if (code === ERROR_CODES.network
          || (code === ERROR_CODES.http && e.status >= 500)) {
        this.error = 'The backend is unreachable. Is it running?';
      } else if (e && e.message) {
        this.error = e.message;
      } else {
        this.error = 'Something went wrong.';
      }
    },
    closeModal() {
      this.$emit('close');
    },
    handleKeydown(event) {
      if (this.show && event.key === 'Escape') this.closeModal();
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
/* Chrome (overlay / surface / close) comes from the global modal skin in
   App.vue; only sizing and content styles live here. */
.saveload-container {
  max-width: 520px;
  padding: 28px 32px 32px;
}
.saveload-content h1 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-semibold);
  font-size: 1.7em;
  margin: 0 0 14px 0;
}
.section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--panel-border);
}
.section:first-of-type { border-top: none; padding-top: 0; margin-top: 6px; }
.section h2 {
  font-family: var(--font-medium);
  font-weight: var(--font-weight-medium);
  font-size: 1.05em;
  margin: 0 0 10px 0;
}
.field { display: block; margin-bottom: 10px; }
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
.field input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint { color: var(--text-muted); font-size: 0.85em; margin: 6px 0 10px 0; }
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

.project-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.project-row {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 8px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-family: var(--font-regular);
}
.project-row.selected { border-color: var(--accent); outline: 1px solid var(--accent); }
.project-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.project-name { font-weight: var(--font-weight-medium); flex: none; }
.project-tags { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
.tag {
  font-size: 0.72em;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 0 7px;
}
.project-date { font-size: 0.75em; color: var(--text-muted); margin-left: auto; flex: none; }

.lineage-graph {
  width: 100%;
  height: auto;
  max-height: 180px;
}
.lineage-edge { stroke: var(--edge-color); stroke-width: 1; }
.lineage-node rect {
  fill: var(--bg-elevated);
  stroke: var(--panel-border);
  cursor: pointer;
}
.lineage-node.focus rect { stroke: var(--accent); stroke-width: 2; fill: var(--bg-input); }
.lineage-node text {
  font-size: 11px;
  fill: var(--text-primary);
  text-anchor: middle;
  pointer-events: none;
  font-family: var(--font-regular);
}

.msg { border-radius: 6px; padding: 8px 12px; font-size: 0.85em; margin: 0 0 12px 0; }
.msg-error { color: #b91c1c; background-color: rgba(220, 38, 38, 0.12); }
.msg-ok { color: var(--success); background-color: rgba(22, 163, 74, 0.12); }
</style>
