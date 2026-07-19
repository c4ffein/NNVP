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

// --- Magnetized snapping ------------------------------------------------------
// While dragging, a window within SNAP_DIST of a "good" position jumps to it:
// the viewport margins, or alignment/adjacency with any other open window.

export const SNAP_DIST = 12;
const SNAP_MARGIN = 12;

// Live registry: each FloatingWindow registers handlers so a dragged sibling
// can snap against it — and dock layouts can resize it (a full-width bottom
// dock shortens the side-docked windows).
// handlers: { getRect(), getZone(), applyRect(partialRect) }
const liveWindows = new Map();
let nextWindowToken = 0;

export function registerWindow(handlers) {
  nextWindowToken += 1;
  liveWindows.set(nextWindowToken, handlers);
  return nextWindowToken;
}

export function unregisterWindow(token) {
  liveWindows.delete(token);
}

export function otherWindowRects(token) {
  const others = [];
  for (const [key, handlers] of liveWindows) {
    if (key !== token) others.push(handlers.getRect());
  }
  return others;
}

/** Docked siblings (zone + rect + resize handle), excluding `token`. */
export function dockedSiblings(token) {
  const docked = [];
  for (const [key, handlers] of liveWindows) {
    if (key === token) continue;
    const zone = handlers.getZone();
    if (zone) docked.push({ zone, rect: handlers.getRect(), applyRect: handlers.applyRect });
  }
  return docked;
}

// Pure: snap each axis to the nearest candidate within SNAP_DIST (or keep it).
// Candidates per axis: the viewport margins, plus for every other window both
// ALIGNMENT (shared left/top edge, shared right/bottom edge) and ADJACENCY
// (flush against its left/right/top/bottom side).
export function snapRect(rect, viewport, others = []) {
  const xTargets = [SNAP_MARGIN, viewport.width - SNAP_MARGIN - rect.width];
  const yTargets = [SNAP_MARGIN, viewport.height - SNAP_MARGIN - rect.height];
  for (const other of others) {
    xTargets.push(
      other.x, // align left edges
      other.x + other.width - rect.width, // align right edges
      other.x + other.width, // flush right of it
      other.x - rect.width, // flush left of it
    );
    yTargets.push(
      other.y,
      other.y + other.height - rect.height,
      other.y + other.height,
      other.y - rect.height,
    );
  }
  const nearest = (value, targets) => {
    let best = value;
    let bestDistance = SNAP_DIST + 1;
    for (const target of targets) {
      const distance = Math.abs(target - value);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }
    return best;
  };
  return { ...rect, x: nearest(rect.x, xTargets), y: nearest(rect.y, yTargets) };
}

// --- Edge docking (Windows-style Aero Snap) -----------------------------------
// Dragging the POINTER to a viewport border proposes a dock: left/right edge
// -> that half of the board, top edge -> maximized, a corner -> that quadrant.
// The caller shows the returned rect as a ghost preview and applies it on drop.

const DOCK_EDGE = 8; // how close (px) the pointer must be to a border
const DOCK_CORNER = 40; // corner zones are more forgiving, like Windows
const DOCK_TOP = 56; // below the menu bar (32px + margins)
const DOCK_GAP = 6; // gap between two docked halves/quadrants

// `pref` is the window's DEFAULT size: side docks recreate the classic
// side-panel look (default width, full height) instead of half the screen,
// and the bottom dock is a full-width bar at the default height. `opts.sideBottomY`
// lets side docks stop above an existing bottom bar (the caller passes the
// bar's top so the ghost preview already shows the final rect).
export function dockZoneAt(pointer, viewport, pref = { width: 300, height: 300 }, opts = {}) {
  const { x, y } = pointer;
  const { width, height } = viewport;
  const margin = 12;
  const innerW = width - margin * 2;
  const innerH = height - DOCK_TOP - margin;
  const halfW = (innerW - DOCK_GAP) / 2;
  const halfH = (innerH - DOCK_GAP) / 2;
  const sideW = Math.min(pref.width, halfW);
  const barH = Math.min(pref.height, innerH / 2);
  const sideBottomY = opts.sideBottomY || (height - margin);
  const sideH = sideBottomY - DOCK_TOP;
  const nearLeft = x <= DOCK_EDGE;
  const nearRight = x >= width - DOCK_EDGE;
  const nearTop = y <= DOCK_EDGE;
  const nearBottom = y >= height - DOCK_EDGE;
  const cornerLeft = x <= DOCK_CORNER;
  const cornerRight = x >= width - DOCK_CORNER;
  const cornerTop = y <= DOCK_CORNER;
  const cornerBottom = y >= height - DOCK_CORNER;
  const rightHalfX = margin + halfW + DOCK_GAP;
  const bottomHalfY = DOCK_TOP + halfH + DOCK_GAP;
  // Corners first (they overlap the edge strips): quadrant tiling.
  if ((nearLeft && cornerTop) || (nearTop && cornerLeft)) {
    return { zone: 'top-left', rect: { x: margin, y: DOCK_TOP, width: halfW, height: halfH } };
  }
  if ((nearRight && cornerTop) || (nearTop && cornerRight)) {
    return { zone: 'top-right', rect: { x: rightHalfX, y: DOCK_TOP, width: halfW, height: halfH } };
  }
  if (nearLeft && cornerBottom) {
    return { zone: 'bottom-left', rect: { x: margin, y: bottomHalfY, width: halfW, height: halfH } };
  }
  if (nearRight && cornerBottom) {
    return { zone: 'bottom-right', rect: { x: rightHalfX, y: bottomHalfY, width: halfW, height: halfH } };
  }
  if (nearLeft) return { zone: 'left', rect: { x: margin, y: DOCK_TOP, width: sideW, height: sideH } };
  if (nearRight) {
    return { zone: 'right', rect: { x: width - margin - sideW, y: DOCK_TOP, width: sideW, height: sideH } };
  }
  if (nearBottom) {
    return { zone: 'bottom', rect: { x: margin, y: height - margin - barH, width: innerW, height: barH } };
  }
  if (nearTop) return { zone: 'max', rect: { x: margin, y: DOCK_TOP, width: innerW, height: innerH } };
  return null;
}
