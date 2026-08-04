# Architecture — how data flows through the client

This file describes module boundaries, state ownership, and data-flow direction in
`nnvp-client-vue`. It deliberately stays at module altitude: no function signatures,
no line numbers, only the contracts and invariants that survive refactors.

**Maintenance rule:** update this file in the same diff whenever a *boundary* moves
(a module changes owner, a facade gains/loses a responsibility, an invariant below
stops being true). Renames and internal refactors that keep the boundaries intact
don't need an edit here. If a statement in this file is wrong, that's a bug in the
diff that made it wrong.

## The big picture

```
                    ┌─────────────────────────────────────────────┐
                    │  Vue Flow store (inside FlowBoard.vue)      │
                    │  = THE canonical live graph state           │
                    └──────────────┬──────────────────────────────┘
                                   │ FlowGraphEditor (via narrow FlowStore interface)
                                   │ derived shims: model.layers/edges/… (in-place mutation)
                    ┌──────────────▼──────────────────────────────┐
       events ◄──── │  $boardInterface (BoardInterface)           │ ◄── menus, panels,
   graph-changed,   │  facade + event bus + side state            │     keyboard, assistant,
   selection-…      └──────────────┬──────────────────────────────┘     tutorial, tests
                                   │ toJSON() / restore()  (adapter.ts, pure)
                    ┌──────────────▼──────────────────────────────┐
                    │  NnvpModel JSON — the ONE intermediate      │
                    │  representation (.nnvp body, formatVersion) │
                    └───┬───────────┬───────────┬─────────────────┘
        .keras import ──┘           │           └── graph snapshot in RunRecord,
        (inverse direction)         │               cloud projects, templates
                    ┌───────────────▼─────────────────────────────┐
                    │  KerasGenerator: one traversal,             │
                    │  four emitters (Py / tfjs-JS / PyTorch /    │
                    │  tinygrad) through codegenSafety            │
                    └───┬─────────────────────────────────────────┘
                        │ generated tfjs JS string (eval'd)
                    ┌───▼─────────────────────────────────────────┐
                    │  Training engines (tfjs; tinygrad bench)    │
                    │  → metrics → charts + run journal           │
                    └───┬─────────────────────────────────────────┘
                        │ RunRecord / ConversationRecord (uuid)
                    ┌───▼─────────────────────────────────────────┐
                    │  LocalStore (IndexedDB) ⇄ Backend /api      │
                    │  merge-free uuid set-difference sync        │
                    └─────────────────────────────────────────────┘
```

Everything downstream of the board — codegen, import, Inspector, Viz3D, run
snapshots, cloud projects — operates on the serialized `NnvpModel`, never on live
board state.

## State ownership map

| State | Owner | Persistence |
|---|---|---|
| Live graph (nodes/edges) | Vue Flow store inside `FlowBoard.vue` | none (serialize on demand) |
| Derived model arrays (layers/edges/inputs/outputs), undo/redo stacks | `FlowGraphEditor` (`lib/FlowInterface`) | none |
| Inspection snapshot, per-layer viz params | `BoardInterface` (side state on the facade) | none |
| Layer catalog (all Keras layer defs) | `generatedKerasLayers.json` + `textLayers.ts`, merged at boot into `$kerasInterface` | checked in |
| Training config | `lib/Training/trainingConfig.ts` reactive singleton | none (snapshotted into runs) |
| Training runs, assistant conversations | RecordStore (`lib/LocalStore`), IndexedDB db `nnvp`, one store per kind | IndexedDB + cloud sync |
| Active chat session | `lib/Assistant/chatSession.ts` reactive module singleton | persisted as a ConversationRecord |
| Auth token, settings, currentProject pointer, panel prefs, tutorial progress, assistant key/mode, deviceId | localStorage (separate keys) | device-only |
| Event bus subscriptions, instanceId/seq | `lib/Events` module singletons (`bus`, `identity`) | none (deviceId excepted, see above) |
| Window rects / z-order | `lib/windowing.ts` in-memory maps + per-`FloatingWindow` component state | deliberately none — reload resets layout |
| Projects (named graph saves) | backend only (`/projects`), saved/loaded manually via AccountPanel | cloud-only, NOT part of record sync |

## The seams (facades and their contracts)

### Vue Flow store ← FlowGraphEditor ← $boardInterface

- Vue Flow's internal store is the **single source of truth** for the live graph.
  No v-model mirrors, no shadow model.
- Only components inside `src/components/FlowBoard/` may call `useVueFlow()`.
  `lib/` never imports `@vue-flow/core` — that's what keeps all of `lib/`
  mountable/testable under bun.
- `FlowGraphEditor` reaches the store through a narrow injected `FlowStore`
  interface and maintains **derived model shims** (`model.layers`,
  `model.edges`, `modelInputs`, `modelOutputs`, selection, undo/redo stacks) —
  the shape the old D3 board's panels were written against, with honest names
  since format v2. These arrays are captured *by reference* — they are only
  ever mutated **in place** (splice/push), never reassigned. Wrapper objects
  are stable per node id.
- `BoardInterface` (`$boardInterface`, installed on `globalProperties` in
  `main.ts`) is the facade everything else talks to: editing verbs, save/load,
  codegen entry points, container getters, typed read views of the derived
  model (`getLayers`/`getEdges`/`getModelInputs`/`getModelOutputs` — readonly,
  live by-reference, re-call per read), and a framework-agnostic event bus
  (`graph-changed`, `selection-changed`, `inspection-changed`, …). It also holds
  cross-cutting side state that isn't graph state: the Inspect-mode activation
  snapshot and 3D viz params. Nothing outside `lib/FlowInterface` and
  `lib/BoardInterface` touches `activeGraph.model` directly.
- Two undo paths with different semantics: `saveState()` snapshots *before* a
  programmatic change; `commit()` (coalesced per microtask, no-op if JSON
  unchanged) records a change Vue Flow *already applied* (interactive connect,
  drag-stop). Mixing them up corrupts the undo stack.
- **Checkpoints and lineage (Phase G2)** are facade side state: Ctrl+S /
  File > Save call `checkpoint()` — a `graph.checkpoint` stored event
  carrying the graph snapshot plus its RECORDED parent (the docHash of the
  state this editing session evolved from), deduped by identity so an
  unchanged board appends nothing. Loads (`loadGraphFromJSON`, templates)
  re-enter the lineage tree by content; File > New starts a root; the same
  parent is stamped into `run.started`. The `onbeforeunload` warning keys
  off changed-since-last-checkpoint, not board emptiness. The .nnvp
  download is Export > Model (.nnvp); the cloud modal moved to
  File > Projects….
- Vue Flow's own delete key is disabled; deletion goes through the facade so the
  undo snapshot and composite-children cleanup happen exactly once.

### NnvpModel — the single intermediate representation

- `lib/FlowInterface/adapter.ts` owns the format: `flowToNnvp` / `nnvpToFlow`
  are pure functions ("the component owns state, this module owns the format").
- `.nnvp` file = literal `NNVP` header line + the model JSON. Every load path
  (device file, `.keras` import, cloud project, run restore) funnels through
  `migrateModel` (`lib/ModelFormat/migrations.ts`, append-only ladder, files
  from the future throw instead of wiping the canvas) and then the same
  `restore()` path, which revives `kerasLayer` payloads into live `KerasLayer`
  instances. All load paths validate before touching the board and roll back
  via undo on failure.
- The format is at **version 2**: honest names (`class: "Layer"`/`"Group"`,
  `htmlID: "layer-N"`). The 1→2 migration renames the D3-era spellings
  (`"D3Layer"`/`"D3LayerComposite"`, `"d3-layer-N"`), so unversioned v1 files
  load forever; saves always stamp v2. The shipped templates are stored v2;
  their original v1 bytes are pinned as migration fixtures in the test suite.
- **Losslessness:** anything Vue Flow doesn't model rides through untouched in
  `node.data.nnvp` / `edge.data.nnvp`, so load→save round-trips are
  byte-faithful. Wiring (`inputLayers`/`outputLayers`) is recomputed from flow
  edges on save — edges are the truth after editing.
- Additive annotation fields (emitted only when present, so old files keep
  saving byte-identically): `unrollSteps` on edges (feedback, below) and
  `comment` on layers — free text, set through the `setLayerComment` facade
  verb (undoable) and edited in LayerOptions. Comments are annotation-grade:
  they feed `docHash`, never `workHash` (see model identity under Training).
- Quirk preserved from D3 days: `outputs` in the format are **the layers feeding
  an Output node** (in edge order), not the Output nodes themselves. Replicated
  in adapter, syncDerived, and Keras import. Easy to misread.
- `.keras` import (`lib/KerasImport`) reads only `config.json` from the ZIP
  (weights ignored) and emits the same `NnvpModel` — import is the inverse of
  codegen's front half.
- Cycles: drawing them is allowed (self-loops and duplicate edges are not);
  every edge on a loop renders in the error color (`edgeInCycle`, live derived
  query, no stored state). A cycle edge means feedback (`unrollSteps`,
  additive field): Python generation unrolls it with shared weights; the
  other targets throw a typed `CyclicGraphError` naming Python as the
  supporting target. Floating edges are purely presentational — recomputed
  per render, nothing stored on the edge.

### Codegen — one traversal, four emitters

- `lib/KerasInterface/KerasGenerator.ts` turns an `NnvpModel` into a
  `GeneratorGraph` + topologically ordered treatment list, computed once and
  shared by all four target helpers (Python/Keras, JavaScript/tfjs,
  PyTorch, tinygrad) via composition. Python↔JS are near-mirrors; PyTorch and
  tinygrad share `KerasGeneratorDimInference` (tinygrad has no lazy modules, so
  in-dims must be inferred up front).
- `KerasGenerator` **mutates its input** — callers must pass an owned deep copy.
- Topological ordering lives in ONE module, `lib/KerasInterface/orderGraph.ts`
  (`orderGraph → {order, excluded, cycles}`), shared by codegen and `.keras`
  import; policies stay per-caller. Import: any cycle refuses the whole file
  with its historical error. Nodes merely unreachable from the model inputs
  (stray half-wired subgraphs, no cycle) are still silently omitted from
  generation (pinned by tests).
- **Cycles are meaningful since Phase D2: a cycle edge is FEEDBACK**, unrolled
  k steps with shared weights (`unrollSteps` on the cycle-closing edge —
  additive v2 field, default 3, sanitized 1..99). Python emission switches to
  the Keras subclassing form: `unrollPlan.ts` (target-agnostic cut selection,
  loop ordering, condensation, feedback-width inference) +
  `KerasGeneratorImperativePythonHelper.ts` (composes the functional Python
  helper, so quoting is identical). Acyclic emission stays byte-identical
  (pinned). JavaScript/PyTorch/tinygrad still throw `CyclicGraphError` naming
  Python as the supporting target; unsupported loop shapes (nested loops,
  ambiguous entries, feedback into an Input, uninferable width) throw typed
  errors, never garbage code. Cyclic graphs are NEVER silently truncated.
- The security boundary includes catalog MEMBERSHIP: `catalogMembership.ts`
  (generated catalog + aliases + text layers) feeds `assertKnownIdentifier`
  at every generate entry point — pattern-valid-but-unknown layer/param names
  are refused; `skipInGeneration` escape-hatch params are exempt (never
  emitted).
- **Security boundary:** the tfjs output is `eval`'d in-browser for training,
  and every interpolated value may come from a hostile `.nnvp`/`.keras` file or
  an assistant `set_param`. `codegenSafety.ts` is the single chokepoint
  (quoting + identifier assertions). Any new emitter or parameter path must go
  through it.
- NNVP's own text/transformer layers live in `textLayers.ts` (with per-target
  source strings prepended to generated code) and are merged into the generated
  catalog at boot — regeneration of `generatedKerasLayers.json` would drop them.
- The Inspector (`lib/Inspector/probe.ts`) and Viz3D shape walk reuse the same
  traversal, relying on the invariant that the JS emitter instantiates exactly
  one tf layer per real node in treatment-list order.
- Known duplication: Keras import has its own topo sort (`layoutModel`, throws
  on cycles) separate from the generator's treatment list (silently drops).

### Training — engine seam behind the UI

- `TrainingZone.vue` orchestrates; `lib/Training/` is the Vue-free seam:
  `engine.ts` defines `TrainingEngine`/`TrainingDataset`/`TrainingCallbacks`,
  implemented by `tfjsEngine` (the default), `workerEngine` (opt-in), and
  `tinygradEngine` (bench-only, behind `?bench=1`).
- **`workerEngine` runs training in a Web Worker** (opt-in via the
  device-local `trainingEngine` setting, default unchanged): the generated
  tfjs code is eval'd with no DOM, no localStorage and no auth token in
  scope, and training stops janking the main thread. The main side runs the
  generateCode thunk (generation errors keep their identity), draws one raw
  tensor-less train/test slice per fit (both JSDatasets loaders expose raw
  draws sharing the tensor path's shuffled cursor) and TRANSFERS the fresh
  buffers; the worker rebuilds tensors and streams batch/epoch progress over
  a small versioned, id-correlated protocol (`workerProtocol.ts`). All
  worker logic lives in `trainingWorkerHost.ts` (bun-tested with real tfjs
  on cpu); the Worker shell (`trainingWorker.ts`) is the only browser-only
  inch (backend: webgl on OffscreenCanvas, else cpu). `session.model` is
  null (tinygrad precedent: Inspect shows its train-first hint); pause and
  the absolute epoch axis survive the message boundary; `buildOptimizer`
  lives in shared `optimizers.ts`. Full main-page `unsafe-eval` removal
  additionally needs worker-script CSP headers (deploy-side, parked).
- tfjs is lazy-loaded (`lib/tf/loadTf.ts`) so the graph editor bundle stays
  small. The model is built by eval'ing generated tfjs code
  (`generateJavascriptNoSave`), then compiled from `trainingConfig` options.
- Metrics flow by reactive reassignment: tfjs callbacks →
  `lib/ModelTrainer/watchTraining.ts` accumulates → reassigns TrainingZone's
  reactive chart objects. No event bus, no chart handles. Cancel is a thrown
  sentinel checked in each callback. A parallel fire-and-forget fork appends
  each epoch to the run journal.
- Datasets (`lib/JSDatasets`) are fetched from a CDN, not bundled — image
  sprite loaders and the char-LM text loader share one duck-typed interface.
  Text uses a fixed 96-char vocab so any corpus fits any text template.
- **Runs are append-only event streams, not records.** `startRun` appends
  `run.started` immediately (crash trace), each metrics row appends
  `run.epoch`, `finish` appends `run.finished` once; "delete" is a reversible
  `run.hidden` event. `lib/Events/store.ts` is the log (append = persist into
  the `'events'` store, then emit on the bus; duplicate uuids are silent
  no-ops, so duplicate delivery is safe by construction; only
  registry-`'stored'` types may be appended). Readers get folds: `foldRun`
  (`lib/Training/runEvents.ts`, pure) orders causally — (deviceId,
  instanceId, seq) chains + `dependsOn` edges; wall clocks never decide —
  tolerates orphans and dupes, and can NEVER conclude "running": an
  unfinished fold has `outcome: null` and goes stale via the pure `isStale`
  display rule. "Training here" is answered only by the live RunController.
  Legacy `RunRecord`s (read-only `'runs'` store) explode on first use into
  synthetic events with deterministic uuids, so two devices migrating the
  same run converge. **No weights** — restore replays setup and curves, not
  the trained model.
- Runs are non-reactive on the Vue side: the tf model, datasets, ApiClient and
  active RunController are kept off reactive state so Vue never proxies tensors.
- One run at a time by design (single `activeRun` slot).
- `TinygradRuntime` is an ahead-of-time pipeline: Pyodide worker traces the
  generated tinygrad model and emits a standalone WebGPU runner module +
  safetensors weights; its engine loops the pre-recorded step. Not
  user-exposed. Its display name in provenance is **tinyloop** (the
  trace-once-loop-the-step binder).
- **Model identity is derived, never stored** (`lib/Training/modelIdentity`,
  the git tree-hash/commit-hash split): `workHash` hashes the computation
  alone (leaf layer types + params, wiring, unroll counts — equal workHash =
  same semantics, NOT byte-identical emitted code), `docHash` adds the
  annotation layer (names, comments, grouping; annotation fields hash only
  when present). Positions and presentation are in neither. Identity is
  document-scoped: layer ids are part of the projection, so the same net
  rebuilt from scratch hashes differently — canonical labeling is parked.
- **Run provenance is a recorded fact, displayed through one table.**
  `run.started` carries an optional additive `hardware` payload (best-effort
  browser capture: cores + unmasked WebGL renderer; masked → field absent);
  `engineId` stays the recorded fact and `lib/Training/engineInfo`'s
  registry-style table derives the "Ran on"/"Lib" columns (unknown ids
  degrade to '—', never throw). Facts are recorded at event time and never
  recomputed — a rule that will extend to remote runs' cost.
- **History/Compare are thin bindings over pure view modules.** The
  History tab groups folds by workHash with filter predicates
  (`historyView`), hosts the unhide action (reversing `run.hidden`), and
  hands checked runs to the Compare tab (`compareView`: overlay chart,
  differ-only config table, three-level identity verdict — identical /
  same-network / different-network). Compare selection is TrainingZone
  component state, deliberately not persisted.
- **The Models window is the architecture story's own document window**
  (Phase G3 — deliberately OUTSIDE the Training zone: training is
  bottom-docked telemetry, this is something you study, usually
  maximized). One owner component (`ModelsWindow`, the TrainingZone
  pattern) over pure modules: `modelTimeline` (oldest-first list, runs +
  checkpoints, `structuralDiff` annotations — computation changes kept
  apart from renames/comments), `evolutionGraph` (states by docHash, edges
  from RECORDED parentage only — an unknown parent degrades to a root,
  nothing is ever inferred — commit-graph lanes), and `modelPreview`
  (read-only geometry from the snapshot's stored positions; also the
  History-thumbnail machinery). Prev/next move the SELECTION; the one
  board mutation is the explicit "Load this state" through the undoable
  `loadGraphFromJSON` path. Everything derives from events already in the
  journal — no new stores.
- Inspect/Viz3D coupling is indirect and goes through the facade: InspectPanel
  probes the trained model → `boardInterface.setInspection` →
  `inspection-changed` → Viz3D recolors. Viz3D never reads training metrics.

### Persistence and sync — merge-free by construction

- `lib/LocalStore` owns three object stores (`RECORD_STORE_NAMES`): `events`
  (the domain event log), `conversations` (records), and `runs` (read-only
  legacy records, kept for the deterministic explosion). IndexedDB db `nnvp`,
  DB version 2 — the first real migration, additive-only: a v1 db gains
  exactly the `events` store. keyPath `uuid`; memory fallback when IndexedDB
  is unavailable. Every `put` deep-copies through JSON — everything stored
  must be JSON-safe so it round-trips through the cloud unchanged.
- uuids are **client-minted** at birth (events and records alike); the
  backend never mints them. That's what makes sync a clean set difference.
- `lib/Backend/sync.ts` has two surfaces. EVENTS (sync v2): pure uuid
  set-difference against `/api/events` — paginate the remote uuid listing to
  a null cursor, batch-get what the client lacks (appended through the event
  store so folds and subscribers update), batch-put what the server lacks
  (per-item idempotent; `exists` is success). Events are immutable, so
  both-sides is always a no-op; LWW does not exist here. RECORDS: only
  conversations remain — whole-record last-writer-wins by ISO `updatedAt`.
  Runs records no longer sync. `localOnly` (events and records) never pushes.
- Run delete choices are hide / cloud / both: "hide" appends `run.hidden`
  (reversible, syncs everywhere); "cloud" purges the stream server-side
  (`DELETE /events/by-stream` — the one destructive primitive, deliberately
  NOT an event) and flags local survivors `localOnly`; "both" purges and
  hides with a device-private hidden event. Local events are never destroyed
  (local purge UX is parked). Conversations keep the classic
  device/cloud/both `deleteEverywhere` matrix with the `localOnly` flag as
  the tombstone-free detach.
- Sync triggers: once at boot if a token is stored, and on every
  `auth.changed` bus event. The wiring lives in `installAppServices`
  (`lib/appServices.ts`) — the app's non-Vue boot services as a callable
  function, invoked by `main.ts` AND by the bun test world, so both run the
  identical wiring (the emitter stays injectable for pure sync tests).
  Coalesced, progressive-enhancement — failures warn, never break the app.
- **Projects are not records.** They are cloud-only full-graph blobs with their
  own CRUD + lineage endpoints, saved/loaded explicitly through AccountPanel;
  `currentProject` is just a localStorage pointer. Don't conflate them with
  the synced kinds.

### Backend and auth

- One `ApiClient` (`lib/Backend/apiClient.ts`), same-origin `/api` only (vite
  proxies to Django in dev). Server record envelope
  `{uuid, created_at, updated_at, payload}` is flattened at the client edge —
  consumers only ever see client-shaped records. All failures are `ApiError`
  with a machine-readable `code`.
- Magic-link auth signs in the **requesting** browser: it stores the pending
  bearer immediately and polls `/auth/status`; the emailed link's browser only
  shows a code and approves — it never receives credentials.
- Auth state broadcasts via the `auth.changed` event on the app bus
  (`lib/Events`); no state library. Token lives in localStorage.
- The backend contract is pinned by `tests/contract/` running the real
  `ApiClient` against a real Django backend, reading magic-link emails from
  Django's file-based mail backend (consume-unseen, not sort-by-time).
  Ownership isolation is asserted as 404-not-403.

### The event core (`lib/Events`)

- One app-wide typed bus (`bus.ts`, a module singleton like `chatSession`):
  a dependency-free `Emitter` (no Vue, no DOM — runs identically under bun)
  with namespaced `"a.b"` event types and one-level prefix wildcard
  subscription (`on('training.*')`, a split on the first `.`, no trie).
  Subscribing returns the unsubscriber; a throwing handler never starves the
  other subscribers.
- `registry.ts` is THE auditable table: every event type is declared there
  with its retention — `'ephemeral'` (bus-only, never persisted) or
  `'stored'` (persisted + synced; the `run.*` lifecycle events and
  `graph.checkpoint`). Retention is
  decided per type in the table, never at call sites; the event store refuses
  to append `'ephemeral'` types. Emitting an unregistered type warns in dev but still delivers —
  an unknown event must never brick the app.
- `identity.ts` says who is speaking: `deviceId` (stable uuid, lazily minted
  into localStorage `nnvp_device_id`), `instanceId` (fresh per page load),
  `nextSeq()` (in-memory monotonic counter per instance — nothing persisted,
  so two tabs never race). Storage is injectable for tests (the
  `StorageLike` pattern of `lib/Settings`).
- Consumers subscribe/emit through the singleton; only tests build their own
  `Emitter`/`Identity`. `main.ts` exposes the bus as `window.nnvp.debug.bus`
  in dev builds for the browser test world.

### Assistant

- `ChatBubble.vue` → `AnthropicClient` (`lib/Assistant/anthropicClient.ts`)
  runs a bounded tool-use loop. Endpoint precedence: explicit base-URL
  override → backend proxy `/api/assistant/messages` when signed in without an
  own key → public Anthropic API with a bring-your-own key.
- `AssistantActions` is a Vue-decoupled facade over `$boardInterface` /
  `$kerasInterface`; all board mutations go through the facade's normal verbs
  (so they're undoable like any user edit). The `MUTATING_TOOLS` set is the
  single source of truth for the read-only guardrail — default is read-only,
  edits are opt-in per device.
- Navigation tools (`start_tutorial`, `open_training_panel`) don't touch the
  board: they emit bus events (`ui.start-tutorial`, `ui.open-training`) that
  App.vue handles.
- Conversation state is the `chatSession` module singleton (survives window
  close); restore-from-store is gated to once per page load so reopening the
  window can't clobber a live session. Conversations persist as records in
  the same RecordStore and remain the one record kind that still syncs.

### App shell, windows, tutorial

- `main.ts` installs the singletons on `app.config.globalProperties`
  (`$kerasInterface`, `$boardInterface`, `$keyboardListener` — the latter is
  constructor-side-effects only) and, in dev builds only, exposes them under
  `window.nnvp.debug` for the browser test world.
- Cross-component signalling that would otherwise couple distant components
  goes over the app event bus (`lib/Events`, see "The event core" below), all
  handled in App.vue or ChatBubble: `auth.changed`, `ui.start-tutorial`,
  `ui.open-training`, `ui.ask-assistant`. The `ui.ask-assistant` bridge keeps
  a one-slot pending ask (`lib/Assistant/askAssistant.ts`) covering the mount
  race: an ask that *causes* ChatBubble to mount is consumed on mount instead
  of lost. No window CustomEvents remain.
- Floating windows: per-window rect/drag/dock state lives in each
  `FloatingWindow.vue` (including maximize/restore — the titlebar toggle
  fills the viewport and restores the exact prior rect); cross-window
  mechanics (z-stack, snap, dock, live registry, remembered rects) live in
  `lib/windowing.ts`. Rects survive close/reopen but deliberately not
  reload.
- Menus (Phase G1): File holds document verbs (New/Load/Templates/
  Save-as-checkpoint/Projects…), Export holds the outputs (four code
  targets + the .nnvp download; the menu tree supports separators via
  em-dash keys). Panels ticks every toggleable window (Catalog, Options,
  Training, 3D View, Models, Chat); the corner controls duplicate 3D and
  chat as icons on purpose — menu entries are for finding, icons for
  reaching.
- Tutorials are declarative defs (`lib/Tutorial/tutorials.ts`) run by one
  generic overlay engine that observes progress through `$boardInterface`
  events plus a poll backup; step predicates read the facade's typed read
  getters (never `activeGraph.model` directly).

## Test architecture (the dual harness)

- Every test is defined once via `tests/harness/define.ts`: `appTest` (drives
  only `world.*` drivers — runs under bun with real mounted SFCs AND under
  Playwright as real clicks), `logicTest` (pure, both runners), `e2eOnly`
  (needs `page`/`canvas`; a ≥20-char reason is enforced at registration).
- The world drivers (`board, chat, catalog, windows, charts, training,
  history, records, backend`, …) are the intersection contract. The bun world
  mounts real components, fakes only the true boundaries (fetch,
  localStorage, the RecordStore), and runs the app's own boot wiring
  (`installAppServices` — the same function `main.ts` calls), so e.g.
  sign-in triggers a real sync pass in BOTH worlds; the browser world drives
  the real UI and reaches app singletons through `window.nnvp.debug`.
- The fake backend is one pure router (`fakeBackend.ts`) with two transports:
  fetch-swap under bun, `page.route` under Playwright.
- Contract tests (see Backend above) are the only tests that need a real
  backend; they're excluded from the unit run.

## Invariants (the short list)

1. Vue Flow's store is the only live graph state; `lib/` never imports Vue Flow.
2. Derived model arrays and containers are mutated in place, never reassigned —
   panels hold them by reference.
3. Everything downstream of the board consumes `NnvpModel` JSON, and every load
   path goes through `migrateModel` + validation before touching the board.
4. `.nnvp` round-trips are lossless via `data.nnvp` passthrough.
5. Drawing cycles is allowed (self-loops and duplicates are not); loop edges
   render in the error color. Cycle edges are feedback: Python codegen
   unrolls them (shared weights); every other target throws a typed
   `CyclicGraphError` — never silent truncation, never garbage code.
6. All generated-code interpolation passes through `codegenSafety` — the tfjs
   output is eval'd, so this is a code-injection boundary.
7. `KerasGenerator` mutates its input; callers pass owned copies.
8. Everything persisted is JSON-safe, uuid-keyed, client-minted. Events are
   immutable and sync by pure set-difference; conversations are whole-record
   LWW; `localOnly` detaches from sync. Folds are pure functions of events;
   no merge logic exists anywhere — keep it that way.
9. Board mutations (user, keyboard, assistant, tutorial) all go through
   `$boardInterface` verbs and are therefore undoable; reads of the derived
   model go through the facade's typed getters — no `activeGraph.model`
   access outside `lib/FlowInterface` + `lib/BoardInterface`.
10. Default assistant mode is read-only; `MUTATING_TOOLS` is the single gate.

## Practices (how new UX lands)

- **Verb-first.** A new user-facing capability lands as a `$boardInterface`
  verb (or bus event) with dual-harness tests FIRST; the pixels that trigger
  it come second, as a thin binding. The verb layer is what both test worlds
  drive and what the assistant/tutorial reuse for free — a feature that only
  exists as a click handler is invisible to all of them. (Current example of
  the gap: `unrollSteps` has no verb yet, so no UI can set it.)
- The bun world runs the app's real boot wiring (`installAppServices`); when
  `main.ts` grows a new service, it goes through that function so both the
  app and the tests keep executing the identical path.

## Known leaks and quirks (accepted, not aspirational)

- Python/JS emitters are near-duplicates; JS imports a type from the Python
  helper. PyTorch/tinygrad are a second mirror pair.
- `TrainingConfigSnapshot` is intentionally defined twice (live config vs
  frozen journal copy) to decouple the journal from the config module.
- The layer catalog JSON is machine-generated from `api/keras_layers.py`;
  text layers must stay in `textLayers.ts` or regeneration silently drops them.
- OrderParameter reorders don't persist on the flow board (wiring is recomputed
  from edges) — tracked in docs/tasks.md as a parity gap.
