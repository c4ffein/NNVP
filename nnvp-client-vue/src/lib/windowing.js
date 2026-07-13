// Shared mechanics for the floating panel windows (FloatingWindow.vue):
// a global z-order stack and viewport clamping for drags, kept as pure
// functions so they are unit-testable.

// Windows sit above the resting panel chrome (z 10) and below the top menu
// (z 500) and blocker modals (z 9999). Every interaction hands out the next
// z, so the most recently touched window is on top.
const BASE_Z = 20;
let topZ = BASE_Z;

export function bringToFront() {
  topZ += 1;
  return topZ;
}

export function resetWindowStack() {
  topZ = BASE_Z;
}

// Keep a dragged window reachable: at least a titlebar-sized strip must stay
// inside the viewport, so it can always be grabbed again.
export const DRAG_GRIP = 56;

export function clampToViewport(rect, viewport) {
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, DRAG_GRIP - rect.width), viewport.width - DRAG_GRIP),
    y: Math.min(Math.max(rect.y, 0), viewport.height - 32),
  };
}

// Windows that unmount on close (chat, training, tutorial) reopen where the
// user left them: FloatingWindow stores its rect here under its windowId.
// In-memory on purpose — a fresh page load starts from the default layout.
const rememberedRects = new Map();

export function rememberRect(windowId, rect) {
  if (windowId) rememberedRects.set(windowId, { ...rect });
}

export function recallRect(windowId) {
  return windowId ? rememberedRects.get(windowId) : undefined;
}

export function resetWindowRects() {
  rememberedRects.clear();
}
