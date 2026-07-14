<template>
  <FloatingWindow
    id="viz3dWindow"
    window-id="viz3d"
    title="3D network view"
    :initial="initialRect"
    :min-width="360"
    :min-height="280"
    @close="$emit('close')"
  >
    <template #actions>
      <span class="viz3d-tag" title="Experimental feature — subject to change">experimental</span>
      <button
        type="button"
        class="viz3d-recenter"
        title="Frame the whole network again"
        @click="recenter"
      >Recenter</button>
    </template>
    <div v-if="!supported" class="viz3d-message">
      <p class="viz3d-message-title">WebGPU not available</p>
      <p>
        This experimental 3D view needs WebGPU, which this browser does not
        expose. Recent Chrome, Edge or Safari on a machine with a GPU should
        work.
      </p>
    </div>
    <div v-else-if="error" class="viz3d-message">
      <p class="viz3d-message-title">Could not start the 3D view</p>
      <p>{{ error }}</p>
    </div>
    <div v-else class="viz3d-stage">
      <canvas
        ref="canvas"
        class="viz3d-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      ></canvas>
      <div v-if="legendOpen" class="viz3d-legend">
        <button
          type="button"
          class="viz3d-legend-toggle"
          title="Hide help"
          aria-label="Hide help"
          @click="setLegendOpen(false)"
        >&minus;</button>
        <div>Drag to orbit · shift-drag to pan · wheel to zoom · click a layer on the board to center it</div>
        <div v-for="line in legendLayers" :key="line">{{ line }}</div>
        <div v-if="legendEdges">{{ legendEdges }}</div>
      </div>
      <button
        v-else
        type="button"
        class="viz3d-legend-fab"
        title="Show help"
        aria-label="Show help"
        @click="setLegendOpen(true)"
      >?</button>
      <div v-if="selectedPlacement" class="viz3d-layer-panel">
        <div class="viz3d-layer-title">
          {{ selectedPlacement.name }}
          <button type="button" class="viz3d-panel-close" aria-label="Deselect layer" @click="selectedLayerId = null">&times;</button>
        </div>
        <div>{{ selectedPlacement.totalUnits }} units · {{ selectedPlacement.kind }}</div>
        <template v-if="selectedChannels > 1">
          <div class="viz3d-panel-row">
            <span>channels {{ selectedPlacement.channelOffset }}–{{ selectedPlacement.channelOffset + selectedPlacement.slices - 1 }} of {{ selectedChannels }}</span>
            <button type="button" :disabled="selectedPlacement.channelOffset <= 0" @click="pageChannels(-1)">◀</button>
            <button type="button" :disabled="selectedPlacement.channelOffset + selectedPlacement.slices >= selectedChannels" @click="pageChannels(1)">▶</button>
          </div>
          <div class="viz3d-panel-row">
            <span>slices</span>
            <select :value="selectedPlacement.slices" @change="setSlices($event.target.value)">
              <option v-for="n in maxSlices" :key="n" :value="n">{{ n }}</option>
            </select>
            <label>
              <input type="checkbox" :checked="selectedPlacement.sideBySide" @change="setSideBySide($event.target.checked)"/>
              side by side
            </label>
          </div>
        </template>
      </div>
      <div v-if="showIntro" class="viz3d-intro">
        <p class="viz3d-intro-title">First time in the 3D view</p>
        <p>
          Neuron color shows activation, from inactive to active on a
          blue-to-red ramp. If you have trouble telling the ends apart
          (red-blindness in particular), a colorblind-safe ramp (Viridis) is
          available in the settings — it also changes the board's inspect
          overlays.
        </p>
        <div class="viz3d-intro-actions">
          <button type="button" @click="openSettingsFromIntro">Open settings</button>
          <button type="button" @click="dismissIntro">Got it</button>
        </div>
      </div>
    </div>
  </FloatingWindow>
</template>

<script>
import FloatingWindow from '../FloatingWindow.vue';
import {
  buildActivations, buildScene, pickLayer, MAX_SLICES_OVERRIDE,
} from '../../lib/Viz3D/sceneBuild';
import { inspectionToViz3D } from '../../lib/Viz3D/inspectionBridge';
import { createViz3DRenderer, webgpuAvailable } from '../../lib/Viz3D/renderer';
import {
  applyOrbitDrag, applyOrbitPan, applyOrbitZoom, createOrbitState,
} from '../../lib/Viz3D/math';
import { colorSchemeOrDefault, rampWgsl } from '../../lib/Settings/colorSchemes';
import { settings } from '../../lib/Settings/settings';

// Graph edits arrive in bursts (a drag fires many) — rebuild once they settle.
const REBUILD_DEBOUNCE_MS = 250;

// Experimental 3D visualization of the active graph: layers become planes of
// neurons stacked by topological depth, sampled connections drawn between
// them. All geometry/sampling lives in lib/Viz3D (pure, tested); this
// component only wires the board model, pointer events and the renderer.
export default {
  name: 'Viz3DWindow',
  components: { FloatingWindow },
  emits: ['close', 'open-settings'],
  data() {
    const width = Math.min(720, window.innerWidth - 80);
    const height = Math.min(520, window.innerHeight - 120);
    return {
      supported: webgpuAvailable(),
      error: '',
      // One-time notice, per device (Settings > viz3dIntroSeen).
      showIntro: !settings.get('viz3dIntroSeen'),
      legendOpen: settings.get('viz3dLegendOpen'),
      selectedLayerId: null,
      sceneVersion: 0,
      legendLayers: [],
      legendEdges: '',
      initialRect: {
        x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
        y: Math.max(52, Math.round((window.innerHeight - height) / 2)),
        width,
        height,
      },
    };
  },
  computed: {
    selectedPlacement() {
      // sceneVersion ties this to rebuilds (this.scene itself is non-reactive).
      if (this.sceneVersion < 0 || !this.scene || this.selectedLayerId === null) return null;
      return this.scene.layers.find(
        placement => String(placement.layerId) === String(this.selectedLayerId),
      ) || null;
    },
    selectedChannels() {
      const placement = this.selectedPlacement;
      if (!placement || placement.kind !== 'planes') return 1;
      return Math.round(placement.totalUnits / (placement.cols * placement.rows));
    },
    maxSlices() {
      return Math.min(MAX_SLICES_OVERRIDE, this.selectedChannels);
    },
  },
  mounted() {
    // Non-reactive: the renderer and orbit state are plain objects touched
    // every frame — Vue proxies would only add overhead.
    this.renderer = null;
    this.scene = null;
    this.orbit = createOrbitState();
    this.dragPointer = null;
    this.rebuildTimer = null;
    this.onGraphChanged = () => {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => this.rebuild(), REBUILD_DEBOUNCE_MS);
    };
    this.onInspectionChanged = () => this.applyInspection();
    this.activeScheme = settings.get('colorScheme');
    this.onSettingsChanged = () => {
      if (settings.get('colorScheme') === this.activeScheme) return;
      this.activeScheme = settings.get('colorScheme');
      this.recreateRenderer();
    };
    // Selecting exactly one layer on the 2D board re-targets the camera on it.
    this.onSelectionChanged = () => {
      if (!this.renderer || !this.scene) return;
      const selected = this.$boardInterface.getActiveElementsContainer().e;
      if (selected.length !== 1) return;
      const placement = this.scene.layers.find(
        candidate => String(candidate.layerId) === String(selected[0].id),
      );
      if (!placement) return;
      this.selectedLayerId = placement.layerId;
      this.orbit = createOrbitState({ ...this.orbit, target: placement.center });
      this.renderer.setCamera(this.orbit);
    };
    // Another consumer (or this window) changed a layer's display params.
    this.onVizParamsChanged = () => this.rebuild();
    this.$boardInterface.on('graph-changed', this.onGraphChanged);
    this.$boardInterface.on('inspection-changed', this.onInspectionChanged);
    this.$boardInterface.on('selection-changed', this.onSelectionChanged);
    this.$boardInterface.on('viz-params-changed', this.onVizParamsChanged);
    settings.onChange(this.onSettingsChanged);
    if (this.supported) this.start();
  },
  beforeUnmount() {
    clearTimeout(this.rebuildTimer);
    this.$boardInterface.off('graph-changed', this.onGraphChanged);
    this.$boardInterface.off('inspection-changed', this.onInspectionChanged);
    this.$boardInterface.off('selection-changed', this.onSelectionChanged);
    this.$boardInterface.off('viz-params-changed', this.onVizParamsChanged);
    settings.offChange(this.onSettingsChanged);
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
  },
  methods: {
    currentModel() {
      const json = this.$boardInterface.getGraphJSON();
      return json ? JSON.parse(json) : {
        layers: [], edges: [], inputs: [], outputs: [],
      };
    },
    buildCurrentScene() {
      return buildScene(this.currentModel(), {
        perLayer: this.$boardInterface.getLayerVizParams(),
      });
    },
    applyScene(scene) {
      this.scene = scene;
      this.sceneVersion += 1;
      this.legendLayers = scene.layers.map(layer => (
        `${layer.name}: ${layer.neuronCount}${layer.overflow ? ` of ${layer.totalUnits}` : ''} neurons`
      ));
      this.legendEdges = scene.stats.omittedEdges > 0
        ? `Connections: ${scene.stats.edgeSegmentCount} shown, ${scene.stats.omittedEdges} omitted`
        : `Connections: ${scene.stats.edgeSegmentCount}`;
      return scene;
    },
    // Live inspection: color neurons with the Inspect tab's activations when
    // a snapshot is published, back to the placeholder gradient when cleared.
    applyInspection() {
      if (!this.renderer || !this.scene) return;
      const perLayer = inspectionToViz3D(this.scene, this.$boardInterface.getInspection());
      this.renderer.setActivations(buildActivations(this.scene, perLayer));
    },
    rampForSettings() {
      return rampWgsl(colorSchemeOrDefault(settings.get('colorScheme')));
    },
    async start() {
      const scene = this.applyScene(this.buildCurrentScene());
      this.orbit = createOrbitState({
        target: scene.bounds.center,
        distance: Math.max(10, scene.bounds.radius * 2.2),
      });
      try {
        this.renderer = await createViz3DRenderer(
          this.$refs.canvas, scene, this.orbit, this.rampForSettings(),
        );
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
        return;
      }
      this.applyInspection();
    },
    // Color scheme changes rebake the shader: tear the renderer down and
    // rebuild on the same scene, keeping the current orbit.
    async recreateRenderer() {
      if (!this.renderer || !this.scene) return;
      this.renderer.destroy();
      this.renderer = null;
      try {
        this.renderer = await createViz3DRenderer(
          this.$refs.canvas, this.scene, this.orbit, this.rampForSettings(),
        );
      } catch (e) {
        this.error = e && e.message ? e.message : String(e);
        return;
      }
      this.applyInspection();
    },
    setLegendOpen(open) {
      settings.set('viz3dLegendOpen', open);
      this.legendOpen = open;
    },
    dismissIntro() {
      settings.set('viz3dIntroSeen', true);
      this.showIntro = false;
    },
    openSettingsFromIntro() {
      this.dismissIntro();
      this.$emit('open-settings');
    },
    rebuild() {
      if (!this.renderer) return;
      const scene = this.applyScene(this.buildCurrentScene());
      this.orbit = createOrbitState({
        ...this.orbit,
        target: scene.bounds.center,
      });
      this.renderer.setScene(scene);
      this.renderer.setCamera(this.orbit);
      this.applyInspection();
    },
    pageChannels(direction) {
      const placement = this.selectedPlacement;
      if (!placement) return;
      this.$boardInterface.setLayerVizParams(String(placement.layerId), {
        channelOffset: Math.max(0, placement.channelOffset + direction * placement.slices),
        slices: placement.slices,
      });
    },
    setSlices(value) {
      const placement = this.selectedPlacement;
      if (!placement) return;
      this.$boardInterface.setLayerVizParams(String(placement.layerId), {
        slices: Number(value),
      });
    },
    setSideBySide(checked) {
      const placement = this.selectedPlacement;
      if (!placement) return;
      this.$boardInterface.setLayerVizParams(String(placement.layerId), {
        sideBySide: checked === true,
      });
    },
    recenter() {
      if (!this.scene) return;
      this.orbit = createOrbitState({
        target: this.scene.bounds.center,
        distance: Math.max(10, this.scene.bounds.radius * 2.2),
      });
      if (this.renderer) this.renderer.setCamera(this.orbit);
    },
    onPointerDown(event) {
      // Left drag orbits; shift-left or middle drag pans (big networks need it).
      if (event.button !== 0 && event.button !== 1) return;
      if (event.button === 1) event.preventDefault();
      this.dragPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        pan: event.shiftKey || event.button === 1,
      };
      event.target.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event) {
      const drag = this.dragPointer;
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      this.orbit = drag.pan
        ? applyOrbitPan(this.orbit, dx, dy)
        : applyOrbitDrag(this.orbit, dx, dy);
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (this.renderer) this.renderer.setCamera(this.orbit);
    },
    onPointerUp(event) {
      const drag = this.dragPointer;
      if (!drag || drag.id !== event.pointerId) return;
      this.dragPointer = null;
      // A click (no real drag): pick the layer under the pointer.
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) return;
      if (!this.scene) return;
      const rect = event.target.getBoundingClientRect();
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      const placement = pickLayer(
        this.scene, this.orbit, ndcX, ndcY, rect.width / Math.max(1, rect.height), Math.PI / 4,
      );
      this.selectedLayerId = placement ? placement.layerId : null;
    },
    onWheel(event) {
      this.orbit = applyOrbitZoom(this.orbit, event.deltaY);
      if (this.renderer) this.renderer.setCamera(this.orbit);
    },
  },
};
</script>

<style scoped>
.viz3d-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
.viz3d-canvas {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: block;
  touch-action: none;
  cursor: grab;
}
.viz3d-canvas:active { cursor: grabbing; }
.viz3d-legend {
  position: absolute;
  left: 8px;
  bottom: 8px;
  max-height: 45%;
  overflow: hidden;
  padding: 6px 24px 6px 8px;
  border-radius: 8px;
  background: rgba(10, 12, 20, 0.65);
  color: #d5dbe6;
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
  text-align: left;
}
.viz3d-legend-toggle {
  position: absolute;
  top: 2px;
  right: 4px;
  padding: 0 5px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  pointer-events: auto;
}
.viz3d-legend-toggle:hover { background: rgba(255, 255, 255, 0.12); }
.viz3d-legend-fab {
  position: absolute;
  left: 8px;
  bottom: 8px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(10, 12, 20, 0.65);
  color: #d5dbe6;
  font-size: 13px;
  cursor: pointer;
}
.viz3d-legend-fab:hover { background: rgba(10, 12, 20, 0.85); }
.viz3d-recenter {
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
}
.viz3d-tag {
  padding: 1px 6px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background-color: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.viz3d-message {
  flex: 1;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: left;
}
.viz3d-layer-panel {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 190px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(10, 12, 20, 0.8);
  color: #d5dbe6;
  font-size: 11px;
  line-height: 1.6;
  text-align: left;
}
.viz3d-layer-title {
  font-weight: var(--font-weight-semibold);
  color: #fff;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.viz3d-panel-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
}
.viz3d-panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.viz3d-panel-row button, .viz3d-panel-row select {
  font-size: 11px;
  border-radius: 6px;
  cursor: pointer;
}
.viz3d-intro {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 420px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(10, 12, 20, 0.85);
  color: #d5dbe6;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}
.viz3d-intro-title {
  font-weight: var(--font-weight-semibold);
  color: #fff;
}
.viz3d-intro-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.viz3d-intro-actions button {
  padding: 2px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}
.viz3d-message-title {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
  font-size: 14px;
}
</style>
