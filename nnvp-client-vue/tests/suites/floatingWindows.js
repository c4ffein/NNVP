/**
 * Panel windows: every side panel is a FloatingWindow — movable by its
 * titlebar, resizable by the corner handle (never below its minimum size),
 * closable from the top-left button, raised above its siblings on click.
 * The z-order/clamping math is pure (src/lib/windowing.js); the appTests run
 * against two real FloatingWindows under bun and against the app's actual
 * catalog/options windows in the browser.
 */
import { logicTest, appTest } from '../harness/define';
import {
  bringToFront, resetWindowStack, clampToViewport, DRAG_GRIP,
  rememberRect, recallRect, resetWindowRects,
  snapRect, SNAP_DIST, dockZoneAt,
} from '../../src/lib/windowing';

logicTest('windowing: bringToFront hands out strictly increasing z-indexes', ({ expect }) => {
  resetWindowStack();
  const first = bringToFront();
  const second = bringToFront();
  expect(second).toBeGreaterThan(first);
  expect(bringToFront()).toBeGreaterThan(second);
  // The stack stays below the top menu (z 500) for any realistic session.
  expect(first).toBeGreaterThanOrEqual(21);
});

logicTest('windowing: clamping keeps a grabbable strip of the window on screen', ({ expect }) => {
  const viewport = { width: 1000, height: 700 };
  const rect = { x: 0, y: 0, width: 300, height: 200 };
  // Dragged far off every edge, some titlebar must remain reachable.
  expect(clampToViewport({ ...rect, x: -900 }, viewport).x).toBe(DRAG_GRIP - 300);
  expect(clampToViewport({ ...rect, x: 5000 }, viewport).x).toBe(1000 - DRAG_GRIP);
  expect(clampToViewport({ ...rect, y: -50 }, viewport).y).toBe(0);
  expect(clampToViewport({ ...rect, y: 5000 }, viewport).y).toBe(700 - 32);
  // In-viewport positions pass through untouched.
  const inside = clampToViewport({ ...rect, x: 120, y: 80 }, viewport);
  expect(inside.x).toBe(120);
  expect(inside.y).toBe(80);
});

appTest('panel windows: the titlebar close button hides the window', async ({ windows, expect }) => {
  await windows.open();
  expect(await windows.isVisible('a')).toBe(true);
  await windows.close('a');
  expect(await windows.isVisible('a')).toBe(false);
  expect(await windows.isVisible('b')).toBe(true); // siblings unaffected
});

appTest('panel windows: dragging the titlebar moves the window', async ({ windows, expect }) => {
  await windows.open();
  const before = await windows.position('a');
  // 65/40 keeps the landing spot outside every snap candidate's SNAP_DIST
  // (60 used to land the bun host window flush-left of its sibling).
  await windows.dragBy('a', 65, 40);
  const after = await windows.position('a');
  expect(Math.round(after.x - before.x)).toBe(65);
  expect(Math.round(after.y - before.y)).toBe(40);
});

appTest('panel windows: clicking a window raises it above the others', async ({ windows, expect }) => {
  await windows.open();
  await windows.raise('a');
  expect(await windows.zIndexOf('a')).toBeGreaterThan(await windows.zIndexOf('b'));
  await windows.raise('b');
  expect(await windows.zIndexOf('b')).toBeGreaterThan(await windows.zIndexOf('a'));
});

appTest('panel windows: the corner handle resizes, but never below the minimum', async ({ windows, expect }) => {
  await windows.open();
  // Crush first, grow second: growing first would push the browser catalog's
  // corner below the viewport (it already reaches near the bottom edge), and
  // a drag cannot START from outside the viewport — the grab would miss.
  await windows.resizeBy('a', -2000, -2000);
  const clamped = await windows.size('a');
  expect(clamped.width).toBe(await windows.expectedMinWidth('a'));
  // Growing from the minimum tracks the drag exactly.
  await windows.resizeBy('a', 80, 60);
  const grown = await windows.size('a');
  expect(Math.round(grown.width - clamped.width)).toBe(80);
  expect(Math.round(grown.height - clamped.height)).toBe(60);
});

appTest('panel windows: resizing from the left edge keeps the right edge anchored', async ({ windows, expect }) => {
  await windows.open();
  const pos = await windows.position('b');
  const size = await windows.size('b');
  const rightEdge = pos.x + size.width;
  await windows.resizeLeftEdgeBy('b', -50); // pull the left edge outward
  const newPos = await windows.position('b');
  const newSize = await windows.size('b');
  expect(Math.round(newSize.width - size.width)).toBe(50);
  expect(Math.round(newPos.x + newSize.width)).toBe(Math.round(rightEdge));
  // Crushing inward clamps at the minimum, still right-anchored.
  await windows.resizeLeftEdgeBy('b', 2000);
  const clamped = await windows.size('b');
  const clampedPos = await windows.position('b');
  expect(clamped.width).toBe(await windows.expectedMinWidth('b'));
  expect(Math.round(clampedPos.x + clamped.width)).toBe(Math.round(rightEdge));
});

logicTest('windowing: remembered rects survive by id and reset cleanly', ({ expect }) => {
  resetWindowRects();
  expect(recallRect('chat')).toBe(undefined);
  rememberRect('chat', { x: 1, y: 2, width: 340, height: 460 });
  expect(recallRect('chat')).toEqual({ x: 1, y: 2, width: 340, height: 460 });
  rememberRect('', { x: 9, y: 9, width: 1, height: 1 }); // no id -> not stored
  expect(recallRect('')).toBe(undefined);
  resetWindowRects();
  expect(recallRect('chat')).toBe(undefined);
});

logicTest('windowing: snapRect magnetizes to viewport margins within SNAP_DIST', ({ expect }) => {
  const viewport = { width: 1000, height: 700 };
  const rect = { x: 20, y: 100, width: 300, height: 200 };
  // 20 is within 12+? no: |20-12| = 8 <= 12 -> snaps to the left margin.
  expect(snapRect(rect, viewport).x).toBe(12);
  // Farther than SNAP_DIST: untouched.
  expect(snapRect({ ...rect, x: 12 + SNAP_DIST + 1 }, viewport).x).toBe(12 + SNAP_DIST + 1);
  // Right margin: viewport.width - 12 - width = 688.
  expect(snapRect({ ...rect, x: 680 }, viewport).x).toBe(688);
});

logicTest('windowing: snapRect aligns and abuts against sibling windows', ({ expect }) => {
  const viewport = { width: 2000, height: 1500 };
  const other = { x: 400, y: 300, width: 300, height: 250 };
  const rect = { width: 200, height: 100 };
  // Alignment: left edges shared.
  expect(snapRect({ ...rect, x: 392, y: 700 }, viewport, [other]).x).toBe(400);
  // Adjacency: flush against the sibling's right side (400 + 300 = 700).
  expect(snapRect({ ...rect, x: 706, y: 700 }, viewport, [other]).x).toBe(700);
  // Adjacency: flush to its left (400 - 200 = 200).
  expect(snapRect({ ...rect, x: 195, y: 700 }, viewport, [other]).x).toBe(200);
  // Vertical: top edges align.
  expect(snapRect({ ...rect, x: 1000, y: 291 }, viewport, [other]).y).toBe(300);
  // The nearest candidate wins when several are in range.
  expect(snapRect({ ...rect, x: 699, y: 700 }, viewport, [other]).x).toBe(700);
});

appTest('panel windows: dragging near the screen edge snaps to the margin', async ({ windows, expect }) => {
  await windows.open();
  // Dropped well away from every snap candidate: lands exactly where asked.
  await windows.dragTo('a', 200, 300);
  const free = await windows.position('a');
  expect(Math.round(free.x)).toBe(200);
  expect(Math.round(free.y)).toBe(300);
  // Within SNAP_DIST of the left margin: magnetizes to exactly 12.
  await windows.dragTo('a', 20, 300);
  const snapped = await windows.position('a');
  expect(Math.round(snapped.x)).toBe(12);
  expect(Math.round(snapped.y)).toBe(300);
});

logicTest('windowing: dockZoneAt — sides at default width, bottom bar full width, top max, corners quadrants', ({ expect }) => {
  const viewport = { width: 1000, height: 700 };
  const pref = { width: 220, height: 300 };
  // Left edge (away from corners): classic side panel — DEFAULT width, full height.
  expect(dockZoneAt({ x: 3, y: 350 }, viewport, pref)).toEqual({
    zone: 'left', rect: { x: 12, y: 56, width: 220, height: 632 },
  });
  // Right edge mirrors it against the right border.
  expect(dockZoneAt({ x: 998, y: 350 }, viewport, pref).rect.x).toBe(1000 - 12 - 220);
  // A huge default width is capped at half the board.
  expect(dockZoneAt({ x: 3, y: 350 }, viewport, { width: 900, height: 300 }).rect.width).toBe(485);
  // Bottom edge: a full-width bar at the default height (capped at half).
  expect(dockZoneAt({ x: 500, y: 698 }, viewport, pref)).toEqual({
    zone: 'bottom', rect: { x: 12, y: 700 - 12 - 300, width: 976, height: 300 },
  });
  // With an existing bottom bar (its top passed in), side docks stop above it.
  expect(dockZoneAt({ x: 3, y: 350 }, viewport, pref, { sideBottomY: 382 }).rect.height).toBe(382 - 56);
  // Top edge (center): maximize to the whole board area.
  expect(dockZoneAt({ x: 500, y: 2 }, viewport, pref).zone).toBe('max');
  // Corners: quadrants (forgiving 40px corner reach on the long axis).
  expect(dockZoneAt({ x: 3, y: 30 }, viewport, pref).zone).toBe('top-left');
  expect(dockZoneAt({ x: 997, y: 680 }, viewport, pref).zone).toBe('bottom-right');
  // Anywhere else: no dock.
  expect(dockZoneAt({ x: 500, y: 350 }, viewport, pref)).toBe(null);
});

appTest('panel windows: dropping on the left border docks at default width, dragging away restores', async ({ windows, expect }) => {
  await windows.open();
  const viewport = await windows.viewport();
  const overhead = await windows.borderOverhead(); // boundingBox counts borders
  const defaults = await windows.defaults('b');
  const before = await windows.size('b');
  // Ride the pointer onto the left border and drop: classic side panel.
  await windows.dragPointerTo('b', 2, Math.round(viewport.height / 2));
  const docked = await windows.position('b');
  const dockedSize = await windows.size('b');
  expect(Math.round(docked.x)).toBe(12);
  expect(Math.round(docked.y)).toBe(56);
  expect(Math.round(dockedSize.width)).toBe(defaults.width + overhead);
  expect(Math.round(dockedSize.height)).toBe(viewport.height - 68 + overhead);
  // Dragging it away restores the pre-dock size.
  await windows.dragBy('b', 200, 150);
  const restored = await windows.size('b');
  expect(Math.round(restored.width)).toBe(Math.round(before.width));
  expect(Math.round(restored.height)).toBe(Math.round(before.height));
});

appTest('panel windows: the bottom bar goes full width and side docks make room, in any order', async ({ windows, expect }) => {
  await windows.open();
  const viewport = await windows.viewport();
  const overhead = await windows.borderOverhead();
  const aDefaults = await windows.defaults('a');
  const bDefaults = await windows.defaults('b');
  const innerH = viewport.height - 68;
  const barHeight = Math.min(bDefaults.height, innerH / 2);
  const barTop = viewport.height - 12 - barHeight;
  const sideHeight = barTop - 6 - 56;

  // Order 1: side first, bottom second — the side SHRINKS to make room.
  await windows.dragPointerTo('a', 2, Math.round(viewport.height / 2));
  await windows.dragPointerTo('b', Math.round(viewport.width / 2), viewport.height - 2);
  expect(Math.round((await windows.size('b')).width)).toBe(viewport.width - 24 + overhead);
  expect(Math.round((await windows.size('b')).height)).toBe(Math.round(barHeight) + overhead);
  expect(Math.round((await windows.size('a')).width)).toBe(aDefaults.width + overhead);
  expect(Math.round((await windows.size('a')).height)).toBe(Math.round(sideHeight) + overhead);

  // Undock both (drag-away restores their floating sizes).
  await windows.dragTo('a', 300, 200);
  await windows.dragTo('b', 600, 200);

  // Order 2: bottom first, side second — the side is BORN short.
  await windows.dragPointerTo('b', Math.round(viewport.width / 2), viewport.height - 2);
  await windows.dragPointerTo('a', 2, Math.round(viewport.height / 2));
  expect(Math.round((await windows.size('a')).height)).toBe(Math.round(sideHeight) + overhead);
  expect(Math.round((await windows.position('a')).y)).toBe(56);
});
