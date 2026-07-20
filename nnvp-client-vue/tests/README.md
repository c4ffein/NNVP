# Tests

**One test, two modes.** Every test is defined ONCE through the helper in
`harness/define.ts` and executed by TWO runners: headlessly under bun
(milliseconds, the inner loop) and click-by-click in a real browser under
Playwright (the trust anchor). Writing a test any other way is not allowed.

## Layout

```
tests/
  harness/    the machine: define.ts (registry), the worlds, both runners,
              bun preloads (happy-dom + the .vue loader), the canvas driver
  suites/     the tests — every *.js here is a suite, index.js is the manifest
  contract/   real-HTTP tests against a live Django backend (own script)
```

## Running

| Command                          | What runs                                        |
|----------------------------------|--------------------------------------------------|
| `bun run test:fast`              | every `both`-mode test, headless, ~2s total      |
| `bun run test:e2e:bun`           | the SAME tests in a real browser + the e2eOnly ones (forces the bun runtime via bunx --bun) |
| `make test-contract` (repo root) | contract/ against a throwaway real backend       |

## Writing a test

Add it to a file in `suites/` (new files must be imported from
`suites/index.js`). Three helpers, one registry, unique names:

```js
import { appTest, logicTest, e2eOnly } from '../harness/define';

// DEFAULT. App behavior through the world — runs in BOTH modes.
appTest('connects layers', async ({ board, expect }) => {
  await board.addLayer('Dense');
  await board.addLayer('Dense');
  await board.connect(0, 1);
  expect(await board.edgeCount()).toBe(1);
});

// Pure logic, no app needed — still executed by both runners (browserless).
logicTest('adapter: round-trips', ({ expect }) => { /* … */ });

// Browser-bound assertions ONLY, with a mandatory, reviewed reason.
e2eOnly('clicking an edge path selects it',
  'Hit-testing against real layout via elementFromPoint — happy-dom has no layout engine.',
  async ({ board, page, canvas, expect }) => { /* … */ },
  { timeoutMs: 60000 }, // optional, for legitimately long tests
);
```

## The world (what appTest fns receive)

One helper surface, two implementations — `worldBun.ts` (direct JS: the real
FlowGraphEditor over a fake store, real SFCs mounted via `@vue/test-utils`)
and `worldBrowser.ts` (the same calls as real UI interaction):

- `board.*` — addLayer, connect, select, deleteSelected, undo/redo,
  loadTemplate, clearBoard, moveLayer, layerCount/edgeCount/layerLabels,
  graphJSON/loadJSON
- `chat.*` — setSignedIn, open, connectPromptVisible, inputEnabled, …
- `expect`, `dispose`

Growing the surface means implementing the helper in BOTH worlds.

## Rules (enforced by review; some by the registry)

1. `appTest`/`logicTest` bodies never touch `page`, the DOM, or component
   internals — only the world. Runner-agnostic matchers only
   (`toBe`/`toEqual`/`toContain`…); Playwright's auto-retrying matchers
   (`toBeVisible`, …) exist only inside `e2eOnly` bodies.
2. `e2eOnly` is for what a browser alone can evaluate: layout/hit-testing,
   hover pointer-events, real drags/keyboard, downloads/choosers/dialogs,
   `page.route` mocking, canvas pixels, live tfjs, the a11y tree, console
   cleanliness. The reason string must say WHICH of these — it is reviewed.
3. Suite files never import `bun:test`/`@playwright/test` (both runners load
   them), and never import `.vue` files or `worldComponents.ts` directly —
   the Playwright runner cannot parse SFCs; component mounting is reached
   only through the bun world.
4. Under bun, `.vue` imports work everywhere else via `harness/vue-loader.ts`
   (a Bun plugin running vue/compiler-sfc, preloaded from `bunfig.toml`
   together with the happy-dom globals).

## Gotchas

- `bun test <dir>` also picks up `*.spec.ts` — that is why `test:fast` lists
  the runner FILES explicitly instead of scanning `harness/`.
- The Playwright runner does `page.goto(home)` + auto-accepts dialogs before
  every app/e2eOnly test; bodies that need their own routes/init-scripts
  register them and re-`goto` themselves.
- happy-dom has no layout engine: geometry is all zeros under bun. If your
  assertion needs geometry, it is an `e2eOnly` — see rule 2, not a workaround.
