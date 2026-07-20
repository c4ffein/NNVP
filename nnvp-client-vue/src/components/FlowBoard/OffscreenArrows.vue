<template>
  <div class="offscreen-arrows">
    <button
      v-for="indicator in indicators"
      :key="indicator.id"
      type="button"
      class="offscreen-arrow"
      :style="{ left: indicator.x + 'px', top: indicator.y + 'px' }"
      :title="'Go to ' + indicator.label + extraCount(indicator)"
      :aria-label="'Go to off-screen layer ' + indicator.label + extraCount(indicator)"
      @click="panTo(indicator.id)"
    >
      <span
        class="offscreen-arrow-glyph"
        aria-hidden="true"
        :style="{ transform: 'rotate(' + indicator.angle + 'deg)' }"
      >➤</span>
      <span v-if="indicator.count > 1" class="offscreen-arrow-count" aria-hidden="true">
        {{ indicator.count }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import offscreenIndicators from '../../lib/FlowInterface/offscreenIndicators';
import type { OffscreenIndicator } from '../../lib/FlowInterface/offscreenIndicators';

// Must be rendered INSIDE <VueFlow> so useVueFlow resolves the board's own
// injected store instead of creating a fresh one.
const {
  getNodes, viewport, dimensions, setCenter, findNode,
} = useVueFlow();

const indicators = computed(
  () => offscreenIndicators(getNodes.value, viewport.value, dimensions.value),
);

// Clicking an arrow brings its layer to the middle of the board, keeping the
// current zoom (fitView-style zoom jumps are disorienting for one node).
function extraCount(indicator: OffscreenIndicator) {
  return indicator.count > 1 ? ` (+${indicator.count - 1} more)` : '';
}

function panTo(id: string) {
  const node = findNode(id);
  if (!node) return;
  const position = node.computedPosition || node.position;
  const width = (node.dimensions && node.dimensions.width) || 0;
  const height = (node.dimensions && node.dimensions.height) || 0;
  setCenter(position.x + width / 2, position.y + height / 2, {
    zoom: viewport.value.zoom,
    duration: 300,
  });
}
</script>

<style>
.offscreen-arrows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
}
.offscreen-arrow {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: all;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: var(--border-width) solid var(--panel-border);
  background-color: var(--bg-panel);
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}
.offscreen-arrow:hover {
  transform: translate(-50%, -50%) scale(1.15);
}
.offscreen-arrow-glyph {
  display: block;
}
.offscreen-arrow-count {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 8px;
  /* Same skin as the arrow button itself — the count is a detail, not the
     louder half of the indicator. */
  border: var(--border-width) solid var(--panel-border);
  background-color: var(--bg-panel);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
