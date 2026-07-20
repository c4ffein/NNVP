<template>
  <div v-if="entry" class="inspection-overlay" :title="tooltip">
    <canvas ref="overlayCanvas" class="inspection-overlay-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import {
  ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance,
} from 'vue';
import { drawInspection } from '../../lib/Inspector/drawInspection';
import { settings } from '../../lib/Settings/settings';
import type { InspectionEntry } from '../../lib/Inspector/probe';

// Per-node activation thumbnail for Inspect mode. Subscribes to the facade's
// 'inspection-changed' event (published by InspectPanel through
// BoardInterface.setInspection) and draws this node's summary if present.
// Renders nothing — restoring the normal node — when inspection is cleared.

const props = defineProps({
  layerId: { type: String, required: true },
});

const instance = getCurrentInstance();
const boardInterface = instance
  ? instance.appContext.config.globalProperties.$boardInterface : null;

const entry = ref<InspectionEntry | null>(null);
const overlayCanvas = ref<HTMLCanvasElement | null>(null);

const tooltip = computed(() => (entry.value ? `activations ${entry.value.shape.join('×')}` : ''));

function onInspectionChanged(data?: unknown) {
  // The facade publishes untyped snapshots; narrow to the InspectPanel shape.
  const snapshot = data as { byLayerId?: Record<string, InspectionEntry> } | null | undefined;
  entry.value = (snapshot && snapshot.byLayerId && snapshot.byLayerId[props.layerId]) || null;
}

watch(entry, async (value) => {
  if (!value) return;
  await nextTick();
  if (overlayCanvas.value) drawInspection(overlayCanvas.value, value.pixels);
});

// A color-scheme change (Settings > Colors) repaints the same pixels.
function onSettingsChanged() {
  if (entry.value && overlayCanvas.value) drawInspection(overlayCanvas.value, entry.value.pixels);
}

onMounted(() => {
  settings.onChange(onSettingsChanged);
  if (!boardInterface) return;
  boardInterface.on('inspection-changed', onInspectionChanged);
  onInspectionChanged(boardInterface.getInspection ? boardInterface.getInspection() : null);
});

onBeforeUnmount(() => {
  settings.offChange(onSettingsChanged);
  if (boardInterface) boardInterface.off('inspection-changed', onInspectionChanged);
});
</script>

<style>
.inspection-overlay {
  margin-top: 6px;
  display: flex;
  justify-content: center;
}
.inspection-overlay-canvas {
  max-width: 100%;
  image-rendering: pixelated;
  border-radius: 3px;
}
</style>
