/**
 * THE test-definition helper. Every test in this repo is declared through one
 * of these three functions — never through bun:test / @playwright/test
 * directly (runners excepted). Definitions live in tests/dual/suites/*.dual.js
 * and are executed by BOTH runners:
 *
 *   - bun:        tests/fast/dual.test.js          (`bun run test:fast`)
 *   - playwright: tests/dual.spec.js               (`bun run test:e2e*`)
 *
 * appTest(name, fn)          fn(world) — app-level behavior through the world
 *                            helpers (world.board.*, …). Runs in BOTH modes:
 *                            direct JS under bun, click-by-click in a browser.
 *                            THE DEFAULT. Never touch `page`/DOM in these.
 *
 * logicTest(name, fn)        fn({ expect }) — pure logic, no app/browser
 *                            needed. Still runs under BOTH runners (cheap:
 *                            the playwright side spawns no browser for it).
 *
 * e2eOnly(name, reason, fn)  fn(world) with world.page/world.canvas exposed.
 *                            ONLY for assertions a real browser can evaluate
 *                            (layout/hit-testing, hover pointer-events, real
 *                            drags, downloads/choosers, WebGL, a11y trees).
 *                            The reason string is MANDATORY, human-readable,
 *                            and reviewed — it must say what makes the test
 *                            physically browser-bound, not why porting was
 *                            inconvenient.
 */

const registry = [];

function register(entry) {
  if (!entry.name || typeof entry.fn !== 'function') {
    throw new Error('dual/define: a test needs a name and a function');
  }
  if (registry.some(existing => existing.name === entry.name)) {
    throw new Error(`dual/define: duplicate test name "${entry.name}"`);
  }
  registry.push(entry);
}

// options (all optional): { timeoutMs } — a per-test timeout for tests that
// legitimately run long (real training, big dataset loads).
export function appTest(name, fn, options = {}) {
  register({
    name, fn, kind: 'app', mode: 'both', options,
  });
}

export function logicTest(name, fn, options = {}) {
  register({
    name, fn, kind: 'logic', mode: 'both', options,
  });
}

export function e2eOnly(name, reason, fn, options = {}) {
  if (typeof reason !== 'string' || reason.trim().length < 20) {
    throw new Error(
      `dual/define: e2eOnly("${name}") requires a real explanation of what `
      + 'makes this test browser-bound (min 20 chars). If you cannot write '
      + 'one, the test belongs in appTest.',
    );
  }
  register({
    name, fn, kind: 'app', mode: 'e2e', reason: reason.trim(), options,
  });
}

export function getRegistry() {
  return registry;
}
