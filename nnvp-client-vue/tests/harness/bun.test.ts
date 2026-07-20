import { describe, it, expect } from 'bun:test';
import '../suites/index';
import { getRegistry } from './define';
import { makeBunWorld } from './worldBun';

// The bun runner for the dual-mode registry: every 'both'-mode test executes
// here headlessly. The e2e-only ones (browser-bound assertions, each with a
// reviewed reason) run only in tests/harness/playwright.spec.ts.
describe('dual-mode suite (bun runner)', () => {
  for (const entry of getRegistry()) {
    if (entry.mode === 'e2e') continue;
    it(entry.name, async () => {
      // (Branch on kind so each fn is called with its own world type.)
      if (entry.kind === 'app') {
        const world = makeBunWorld(expect);
        try {
          await entry.fn(world);
        } finally {
          if (world.dispose) await world.dispose();
        }
      } else {
        await entry.fn({ expect });
      }
    }, entry.options && entry.options.timeoutMs);
  }
});
