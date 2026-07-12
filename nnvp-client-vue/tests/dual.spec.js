import { test, expect } from './helpers/canvas';
// Logic tests may touch DOM globals (localStorage, window events); bun gets
// them from bunfig preload, this runner registers the same happy-dom shim.
import './happydom';
import './dual/suites/index';
import { getRegistry } from './dual/define';
import { makeBrowserWorld } from './dual/worldBrowser';

// The Playwright runner for the dual-mode registry (see tests/dual/define.js):
// - app tests run click-by-click against the real UI (the SAME functions run
//   headlessly in tests/fast/dual.test.js);
// - logic tests run in-process (no page fixture requested -> no browser);
// - e2e-only tests additionally get world.page/world.canvas; each carries a
//   reviewed reason for being browser-bound.
test.describe('dual-mode suite (browser runner)', () => {
  for (const entry of getRegistry()) {
    if (entry.kind === 'logic') {
      test(`[logic] ${entry.name}`, async () => {
        await entry.fn({ expect });
      });
    } else if (entry.mode === 'both') {
      test(entry.name, async ({ page, canvas }) => {
        if (entry.options.timeoutMs) test.setTimeout(entry.options.timeoutMs);
        page.on('dialog', dialog => dialog.accept()); // File > New confirmation
        await page.goto(canvas.home);
        await page.waitForSelector('.vue-flow__pane');
        await entry.fn(makeBrowserWorld(page, canvas, expect));
      });
    } else {
      test(`${entry.name} [e2e-only]`, async ({ page, canvas }) => {
        if (entry.options.timeoutMs) test.setTimeout(entry.options.timeoutMs);
        test.info().annotations.push({ type: 'e2e-only-reason', description: entry.reason });
        page.on('dialog', dialog => dialog.accept());
        await page.goto(canvas.home);
        await page.waitForSelector('.vue-flow__pane');
        await entry.fn(makeBrowserWorld(page, canvas, expect, { exposePage: true }));
      });
    }
  }
});
