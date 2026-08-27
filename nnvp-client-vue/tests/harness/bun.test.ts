import { describe, it, expect } from 'bun:test';
import { getRegistry } from './define';
import { makeBunWorld } from './worldBun';
import { discoverSuites } from './discoverSuites';

// Suites register at import time; discovery replaces the old hand-listed
// manifest (see discoverSuites.ts) — top-level await so the registry is
// complete before the describe below enumerates it.
await discoverSuites();

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
