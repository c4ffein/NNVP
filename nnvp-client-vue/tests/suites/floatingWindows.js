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
  await windows.dragBy('a', 60, 40);
  const after = await windows.position('a');
  expect(Math.round(after.x - before.x)).toBe(60);
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
