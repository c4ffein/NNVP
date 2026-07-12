import { describe, it, expect } from 'bun:test';
import '../suites/index';
import { getRegistry } from './define';
import { makeBunWorld } from './worldBun';

// The bun runner for the dual-mode registry: every 'both'-mode test executes
// here headlessly. The e2e-only ones (browser-bound assertions, each with a
// reviewed reason) run only in tests/harness/playwright.spec.js.
describe('dual-mode suite (bun runner)', () => {
  for (const entry of getRegistry()) {
    if (entry.mode === 'e2e') continue;
    it(entry.name, async () => {
      const world = entry.kind === 'app' ? makeBunWorld(expect) : { expect };
      try {
        await entry.fn(world);
      } finally {
        if (world.dispose) await world.dispose();
      }
    }, entry.options && entry.options.timeoutMs);
  }
});
