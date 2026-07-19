# Tasks

Not creating issues for those.
But if you read this and you want to get involved, you can actually create one from any item of this list.

## High Priority

### 1. Client improvements
- [ ] More modern / bold but still minimalistic theme
  - [ ] Loading - list of blocks growing from bottom to top, starting when reached, smoother than current solution
  - [x] Left menu - search is a fixed header (no overscroll bounce), only the list scrolls
  - [x] Bottom menu - Training is a themed window: left-aligned pill tabs with an active state, only the panel scrolls
  - [ ] Comprehensive manual testing to find potential regressions => add more tests + fix
  - [ ] List last small improvements
  - [x] Have all menus as windows: movable, resizable from edges/corners, closable, show/hide via the Panels menu, reopen where left
    - [ ] magnetized (snap to edges / other windows)
    - [ ] persist window layout across reloads + a "Reset layout" entry
- [ ] reorder categories
- [x] help through categories ((?) on category titles, shared help modal, "Ask the assistant" handoff)
- [x] fast version of e2e tests: everything also exposed as a method, and not only through a click
  - [x] executable in a very efficient way, but have both helpers in the tests: browser vs mocked + method version
        => dual registry in `tests/harness/define.js` (appTest/logicTest/e2eOnly) + `tests/suites/`:
        `make test-unit` runs them headless under bun in seconds; `make test-e2e` runs the
        SAME definitions in Chromium via Playwright — both green in CI (Tests - Bun Runner /
        Tests - Playwright jobs)
  - [ ] port more specs into dual scenarios (grouping needs browser multi-select first)
- [x] account: don't let the user pick a backend => same-origin `/api` (vite proxies to
      the Django server in dev, `make backend` runs it), magic-link only login,
      account created on first login
  - [ ] manage from device to account when the user creates an account
  - [ ] manage from device to account when the user connects an account
  - [ ] let the user still choose what to keep on the device
  - [ ] share between accounts
  - [ ] collaborative mode, live

### 2. Deployment
- [ ] Migrate from Netlify to OVH for the SPA
- [ ] Destroy previous nnvp.io hosting
- [ ] Destroy previous about.nnvp.io hosting

### Assistant (chat)
- [ ] conversation should survive closing/reopening the chat window (module store, like window rects)
- [ ] expose auto-layout as an assistant tool so its built networks arrange themselves
- [ ] offscreen-layer border arrows: avoid landing under floating windows (direction-aware insets)

### 3. Canvas migration (D3 => Vue Flow)

The canvas is [Vue Flow](https://vueflow.dev) behind the `$boardInterface` facade (renamed from `$d3Interface`)
the rest of the app talks to; the hand-rolled D3 whiteboard is migrated and deleted.

- [x] Migrate to Vue Flow (adapter with lossless NNVP round-trip, D3GraphEditor-shaped
      facade) and delete the D3 board (WhiteBoard, D3GraphEditor and friends,
      `?canvas=d3`, the d3 e2e project, the `d3` npm dependency)
- [x] Floating edges: links re-anchor to the best border point as layers move
- [x] Show edge direction (animated dashes) and mark cycle edges in red
      (cyclic graphs can still be loaded from files made on the old board)
- [ ] Phase 2: fork vue-flow as cold storage, `bun patch` for urgent fixes
- [ ] Parity gap: OrderParameter reorders (merge-layer inputs, model inputs/outputs)
      don't persist on the flow board (wiring is recomputed from edges)
- [ ] Parity gap: click-to-link mode was D3-only => decide to reimplement or drop
- [x] Chore: bump @playwright/test (1.61) — the PW_DISABLE_TS_ESM workaround is gone

### 4. TypeScript

Gradual adoption: .ts is strictly checked, .js rides along unchecked and
converts opportunistically.

- [x] tsconfig (`allowJs: true, checkJs: false, strict: true`) + `bun run typecheck`
      wired into CI (typescript pinned to 5.x)
- [x] `types/model.ts`: NnvpModel/NnvpLayer/NnvpEdge, KerasLayer, discriminated
      union on `parameterDef.type`
- [ ] Convert `FlowInterface/adapter`
- [ ] Convert `FlowGraphEditor` => generators (KerasInterface) => apiClient;
      components stay JS and convert opportunistically when touched
- [ ] Rewrite GeneralMenu.vue from `lang="jsx"` to a template (deletes
      @vitejs/plugin-vue-jsx and the hardest file to type)

## Future Features

### Tutorial mode
- [x] Create a guided tutorial module for building models step-by-step
      (Tutorial menu + overlay with coachmarks, completion bars; the assistant can start one)
  - Reference: [Keras Sequential Model Guide](https://keras.io/guides/sequential_model/)
- [ ] tutorial from "What is a neural network" to "Your first LLM"

### Alternate backend support
- [ ] Add alternate PyTorch layers + code generation
- [ ] Add alternate Tinygrad layers + code generation
- [ ] In-browser tinygrad training engine (lib/Training/tinygradEngine +
      lib/TinygradRuntime) — NOT user-exposed for now: reachable only through
      the `?bench=1` Bench tab and `make test-webgpu`; graduation blocked on
      the items below
- [ ] Real-pipeline verification harness (`make test-webgpu`): Pyodide trace +
      emitted runner on SwiftShader WebGPU — pins per-step dropout, live
      BatchNorm running stats (were: untraceable + frozen), eval weight sync
- [ ] tinygrad engine graduation: HWC→CHW transpose for multi-channel (RGB)
      inputs; Adam (driver already parameterizes the optimizer); then re-add
      a Settings engine picker (an AccountPanel radio section + a TrainingZone
      engine switch — both small; BenchPanel shows the engine wiring)
