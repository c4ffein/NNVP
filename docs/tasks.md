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
- [ ] fast version of e2e tests: everything also exposed as a method, and not only through a click
  - [ ] executable in a very efficient way, but have both helpers in the tests: browser vs mocked + method version
- [ ] account: don't let the user pick a backend
  - [ ] manage from device to account when the user creates an account
  - [ ] manage from device to account when the user connects an account
  - [ ] let the user still choose what to keep on the device
  - [ ] share between accounts
  - [ ] collaborative mode, live

### 2. New tests for broken features
- [x] When deselecting a layer, we have to go back to the empty selection in the right panel

### 3. Deployment
- [ ] Migrate from Netlify to OVH for the SPA
- [ ] Destroy previous nnvp.io hosting
- [ ] Destroy previous about.nnvp.io hosting

### 5. Canvas migration (D3 => Vue Flow)

The hand-rolled D3 whiteboard is being replaced by [Vue Flow](https://vueflow.dev),
behind the `$d3Interface` facade the rest of the app already talks to.

- [x] Phase 1: Vue Flow is the default canvas (adapter with lossless NNVP round-trip,
      D3GraphEditor-shaped facade, whole e2e suite running against both canvases,
      `?canvas=d3` escape hatch)
- [x] Floating edges: links re-anchor to the best border point as layers move
- [x] Show edge direction (animated dashes) and mark cycle edges in red
      (cyclic graphs can still be loaded from files made on the old board)
- [x] Delete the legacy D3 rendering internals (WhiteBoard, D3GraphEditor and friends,
      `?canvas=d3`, the d3 e2e project, the `d3` npm dependency)
- [ ] Phase 2: fork vue-flow as cold storage, `bun patch` for urgent fixes
- [ ] Parity gap: OrderParameter reorders (merge-layer inputs, model inputs/outputs)
      don't persist on the flow board (wiring is recomputed from edges)
- [ ] Parity gap: click-to-link mode was D3-only => decide to reimplement or drop
- [ ] Chore: bump @playwright/test to ^1.58 (drops the PW_DISABLE_TS_ESM workaround)

### 6. TypeScript

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
