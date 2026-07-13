<template>
  <div
    class="floating-panel floating-window"
    :style="{
      left: rect.x + 'px',
      top: rect.y + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      minWidth: minWidth + 'px',
      minHeight: minHeight + 'px',
      zIndex: z,
    }"
    @pointerdown="raise"
  >
    <div class="floating-window-titlebar" @pointerdown="startDrag">
      <button
        type="button"
        class="floating-window-close"
        :aria-label="'Close ' + title"
        :title="'Close ' + title"
        @pointerdown.stop
        @click="$emit('close')"
      >×</button>
      <span class="floating-window-title">{{ title }}</span>
      <span v-if="$slots.actions" class="floating-window-actions" @pointerdown.stop>
        <slot name="actions" />
      </span>
    </div>
    <div class="floating-window-body"><slot /></div>
    <!-- Resize zones: bottom corners are 2-axis, left/right/bottom edges are
         1-axis. No top zone — the titlebar owns that edge for dragging. -->
    <div class="floating-window-edge fw-edge-w" aria-hidden="true" @pointerdown.stop="startResize($event, 'w')"></div>
    <div class="floating-window-edge fw-edge-e" aria-hidden="true" @pointerdown.stop="startResize($event, 'e')"></div>
    <div class="floating-window-edge fw-edge-s" aria-hidden="true" @pointerdown.stop="startResize($event, 's')"></div>
    <div class="floating-window-edge fw-corner-sw" aria-hidden="true" @pointerdown.stop="startResize($event, 'sw')"></div>
    <div class="floating-window-resize" aria-hidden="true" @pointerdown.stop="startResize($event, 'se')"></div>
  </div>
</template>

<script>
import {
  bringToFront, clampToViewport, rememberRect, recallRect,
} from '../lib/windowing';

// A movable, resizable, closable window over the board: drag by the titlebar,
// resize by the bottom-right handle (never below minWidth/minHeight), any
// pointerdown raises it above the other windows. The parent owns visibility
// (v-if / v-show) and reacts to the titlebar's `close`.
export default {
  name: 'FloatingWindow',
  emits: ['close'],
  props: {
    title: { type: String, required: true },
    // Starting rect ({x, y, width, height}); the parent computes it from the
    // viewport so each window opens where its fixed panel used to live.
    initial: { type: Object, required: true },
    minWidth: { type: Number, default: 220 },
    minHeight: { type: Number, default: 200 },
    // Set to reopen at the last position/size after an unmount (close) —
    // without it, every remount starts from `initial`.
    windowId: { type: String, default: '' },
  },
  data() {
    return {
      rect: { ...(recallRect(this.windowId) || this.initial) },
      z: bringToFront(),
      dragFrom: null,
    };
  },
  beforeUnmount() {
    this.stopTracking();
    rememberRect(this.windowId, this.rect);
  },
  methods: {
    raise() {
      this.z = bringToFront();
    },
    startDrag(event) {
      this.startTracking(event, 'move');
    },
    startResize(event, direction) {
      this.raise();
      this.startTracking(event, direction);
    },
    startTracking(event, mode) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      this.dragFrom = {
        mode,
        px: event.clientX,
        py: event.clientY,
        x: this.rect.x,
        y: this.rect.y,
        width: this.rect.width,
        height: this.rect.height,
      };
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
    },
    onPointerMove(event) {
      const from = this.dragFrom;
      if (!from) return;
      const dx = event.clientX - from.px;
      const dy = event.clientY - from.py;
      if (from.mode === 'move') {
        const next = clampToViewport(
          { ...this.rect, x: from.x + dx, y: from.y + dy },
          { width: window.innerWidth, height: window.innerHeight },
        );
        this.rect.x = next.x;
        this.rect.y = next.y;
        return;
      }
      if (from.mode.includes('e')) {
        this.rect.width = Math.max(this.minWidth, from.width + dx);
      }
      if (from.mode.includes('w')) {
        // The right edge stays anchored: x follows the width change.
        const width = Math.max(this.minWidth, from.width - dx);
        this.rect.x = from.x + (from.width - width);
        this.rect.width = width;
      }
      if (from.mode.includes('s')) {
        this.rect.height = Math.max(this.minHeight, from.height + dy);
      }
    },
    onPointerUp() {
      const resized = this.dragFrom && this.dragFrom.mode !== 'move';
      this.stopTracking();
      rememberRect(this.windowId, this.rect);
      // Content that measures itself against the window (e.g. the training
      // charts) re-renders on the global resize signal it already listens to.
      if (resized) window.dispatchEvent(new Event('resize'));
    },
    stopTracking() {
      this.dragFrom = null;
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
    },
  },
};
</script>

<style>
/* Double class beats .floating-panel's position: absolute regardless of
   stylesheet order: windows are viewport-fixed, never affected by any
   positioned ancestor (chat mounts inside one) or programmatic container
   scrolls (focus() in an overflow-hidden app shifts everything absolute). */
.floating-panel.floating-window {
  position: fixed;
  display: flex;
  flex-direction: column;
}

.floating-window-titlebar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--panel-border);
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.floating-window-close {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--panel-border);
  background-color: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-window-close:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

.floating-window-title {
  flex: 1;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-muted);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.floating-window-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: default;
}


.floating-window-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

/* Invisible 1-axis strips (and the bottom-left corner) — cursor only. */
.floating-window-edge {
  position: absolute;
  touch-action: none;
}
.fw-edge-w,
.fw-edge-e {
  top: 34px;
  bottom: 16px;
  width: 6px;
  cursor: ew-resize;
}
.fw-edge-w { left: 0; }
.fw-edge-e { right: 0; }
.fw-edge-s {
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 6px;
  cursor: ns-resize;
}
.fw-corner-sw {
  left: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nesw-resize;
}

/* Invisible like the edge strips — the cursor is the affordance. */
.floating-window-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  touch-action: none;
}
</style>
