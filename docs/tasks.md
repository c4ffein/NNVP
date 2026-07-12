# Tasks

Not creating issues for those.
But if you read this and you want to get involved, you can actually create one from any item of this list.

## High Priority

### 1. Client improvements
- [ ] More modern / bold but still minimalistic theme
  - [ ] Loading - list of blocks growing from bottom to top, starting when reached, smoother than current solution
  - [ ] Left menu - separate blocks scrolling separately, search always present
  - [ ] Bottom menu - redo everythin to be cleaner
  - [ ] Comprehensive manual testing to find potential regressions => add more tests + fix
  - [ ] List last small improvements
  - [ ] Have all menus as minifiable windows, magnetized, can show/hide
- [ ] reorder categories
- [ ] help through categories
- [x] fast version of e2e tests: everything also exposed as a method, and not only through a click
  - [x] executable in a very efficient way, but have both helpers in the tests: browser vs mocked + method version
        => `tests/scenarios/` (one scenario, two drivers): `bun run test:fast` runs them
        headless on FlowGraphEditor in <1s; `tests/scenarios.spec.js` runs the SAME
        scenarios click-by-click under Playwright
  - [ ] port more specs into scenarios (grouping needs browser multi-select first)
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

### 3. Canvas migration (D3 => Vue Flow)

The canvas is [Vue Flow](https://vueflow.dev) behind the `$d3Interface` facade
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
- [ ] Chore: bump @playwright/test to ^1.58 (drops the PW_DISABLE_TS_ESM workaround)

### 4. TypeScript

Gradual adoption: .ts is strictly checked, .js rides along unchecked and
converts opportunistically.

- [x] tsconfig (`allowJs: true, checkJs: false, strict: true`) + `bun run typecheck`
      wired into CI (typescript pinned to 5.x)
- [x] `types/model.ts`: NnvpModel/NnvpLayer/NnvpEdge, KerasLayer, discriminated
      union on `parameterDef.type`
- [x] Convert `FlowInterface/adapter`
- [ ] Convert `FlowGraphEditor` => generators (KerasInterface) => apiClient;
      components stay JS and convert opportunistically when touched
- [ ] Rewrite GeneralMenu.vue from `lang="jsx"` to a template (deletes
      @vitejs/plugin-vue-jsx and the hardest file to type)

## Future Features

### Tutorial mode
- [ ] Create a guided tutorial module for building models step-by-step
  - Reference: [Keras Sequential Model Guide](https://keras.io/guides/sequential_model/)
- [ ] tutorial from "What is a neural network" to "Your first LLM"

### Alternate backend support
- [ ] Add alternate PyTorch layers + code generation
- [ ] Add alternate Tinygrad layers + code generation
