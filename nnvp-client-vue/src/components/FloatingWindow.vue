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
    <!-- Ghost preview of the dock target while the pointer rides a border
         (below every window in the z-stack, above the board). -->
    <Teleport to="body">
      <div
        v-if="dockPreview"
        class="floating-window-dock-preview"
        :style="{
          left: dockPreview.rect.x + 'px',
          top: dockPreview.rect.y + 'px',
          width: dockPreview.rect.width + 'px',
          height: dockPreview.rect.height + 'px',
        }"
      ></div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import {
  bringToFront, clampToViewport, rememberRect, recallRect,
  registerWindow, unregisterWindow, otherWindowRects, dockedSiblings,
  snapRect, dockZoneAt,
} from '../lib/windowing';
import type { DockZone, WindowRect } from '../lib/windowing';

// 'move' is a titlebar drag; the rest are resize directions (compass edges
// and corners, matched via mode.includes()).
type DragMode = 'move' | 'w' | 'e' | 's' | 'sw' | 'se';

/** Pointer position + rect captured when a drag/resize starts. */
interface DragOrigin {
  mode: DragMode;
  px: number;
  py: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Tests may dispatch synthetic pointer events without a `button` field, hence
// the optional typing (startTracking already guarded for that at runtime).
type PointerDownLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'preventDefault'> & { button?: number };

// Non-reactive instance field assigned outside data() (pure typing pass:
// keeping it out of data() preserves its non-reactive nature).
interface FloatingWindowInstanceExtra { snapToken?: number }

// A movable, resizable, closable window over the board: drag by the titlebar,
// resize by the bottom-right handle (never below minWidth/minHeight), any
// pointerdown raises it above the other windows. The parent owns visibility
// (v-if / v-show) and reacts to the titlebar's `close`.
export default defineComponent({
  name: 'FloatingWindow',
  emits: ['close'],
  props: {
    title: { type: String, required: true },
    // Starting rect ({x, y, width, height}); the parent computes it from the
    // viewport so each window opens where its fixed panel used to live.
    initial: { type: Object as PropType<WindowRect>, required: true },
    minWidth: { type: Number, default: 220 },
    minHeight: { type: Number, default: 200 },
    // Set to reopen at the last position/size after an unmount (close) —
    // without it, every remount starts from `initial`.
    windowId: { type: String, default: '' },
  },
  data() {
    return {
      rect: { ...(recallRect(this.windowId) || this.initial) } as WindowRect,
      z: bringToFront(),
      dragFrom: null as DragOrigin | null,
      dockPreview: null as { zone: DockZone; rect: WindowRect } | null,
      // Size before the last dock, restored when dragged away (Windows-like).
      preDock: null as { width: number; height: number } | null,
      // Which dock zone this window currently occupies (null = free-floating).
      dockedZone: null as DockZone | null,
    };
  },
  created() {
    // Register with the window registry: siblings snap against our rect, and
    // dock layouts may resize us (a bottom bar shortens side-docked windows).
    (this as unknown as FloatingWindowInstanceExtra).snapToken = registerWindow({
      getRect: () => ({ ...this.rect }),
      getZone: () => this.dockedZone,
      applyRect: (partial: Partial<WindowRect>) => {
        if (partial.width !== undefined) this.rect.width = Math.max(this.minWidth, partial.width);
        if (partial.height !== undefined) this.rect.height = Math.max(this.minHeight, partial.height);
        if (partial.x !== undefined) this.rect.x = partial.x;
        if (partial.y !== undefined) this.rect.y = partial.y;
        rememberRect(this.windowId, this.rect);
      },
    });
  },
  beforeUnmount() {
    this.stopTracking();
    rememberRect(this.windowId, this.rect);
    unregisterWindow((this as unknown as FloatingWindowInstanceExtra).snapToken!);
  },
  methods: {
    raise() {
      this.z = bringToFront();
    },
    startDrag(event: PointerEvent) {
      this.startTracking(event, 'move');
    },
    startResize(event: PointerEvent, direction: Exclude<DragMode, 'move'>) {
      this.raise();
      this.dockedZone = null; // a manual resize opts out of the dock layout
      this.startTracking(event, direction);
    },
    startTracking(event: PointerDownLike, mode: DragMode) {
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
    onPointerMove(event: PointerEvent) {
      const from = this.dragFrom;
      if (!from) return;
      const dx = event.clientX - from.px;
      const dy = event.clientY - from.py;
      if (from.mode === 'move') {
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        // Dragging away from a dock restores the pre-dock size under the
        // pointer (a plain titlebar click must not — hence the 4px gate).
        if (this.preDock && Math.abs(dx) + Math.abs(dy) > 4) {
          this.rect.width = this.preDock.width;
          this.rect.height = this.preDock.height;
          this.preDock = null;
          this.dockedZone = null;
          from.x = event.clientX - this.rect.width / 2;
          from.y = event.clientY - 12;
          from.px = event.clientX;
          from.py = event.clientY;
        }
        const next = snapRect(
          clampToViewport({ ...this.rect, x: from.x + dx, y: from.y + dy }, viewport),
          viewport,
          otherWindowRects((this as unknown as FloatingWindowInstanceExtra).snapToken!),
        );
        this.rect.x = next.x;
        this.rect.y = next.y;
        // Side docks stop above an existing bottom bar, so the ghost preview
        // already shows the exact final rect.
        const bottomBar = dockedSiblings((this as unknown as FloatingWindowInstanceExtra).snapToken!)
          .find(sib => sib.zone === 'bottom');
        this.dockPreview = dockZoneAt(
          { x: event.clientX, y: event.clientY },
          viewport,
          { width: this.initial.width, height: this.initial.height },
          bottomBar ? { sideBottomY: bottomBar.rect.y - 6 } : {},
        );
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
      if (this.dockPreview) {
        // Drop on a border: take the dock rect (never below the minimums),
        // remembering the free-floating size for the drag-away restore.
        this.preDock = { width: this.rect.width, height: this.rect.height };
        const { zone, rect: dock } = this.dockPreview;
        this.rect.x = dock.x;
        this.rect.y = dock.y;
        this.rect.width = Math.max(this.minWidth, dock.width);
        this.rect.height = Math.max(this.minHeight, dock.height);
        this.dockedZone = zone;
        this.dockPreview = null;
        // A new bottom bar claims the bottom strip: side-docked siblings
        // shorten so they end just above it.
        if (zone === 'bottom') {
          for (const sibling of dockedSiblings((this as unknown as FloatingWindowInstanceExtra).snapToken!)) {
            if (sibling.zone === 'left' || sibling.zone === 'right') {
              sibling.applyRect({ height: this.rect.y - sibling.rect.y - 6 });
            }
          }
        }
      }
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
});
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

.floating-window-dock-preview {
  position: fixed;
  z-index: 15; /* above the board (10), below every window (20+) */
  pointer-events: none;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border: 2px solid var(--accent);
  border-radius: var(--border-radius);
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
