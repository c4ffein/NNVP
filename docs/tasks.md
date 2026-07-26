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
        => training runs + assistant conversations: local records carry client uuids
        (IndexedDB via `lib/LocalStore`), `lib/Backend/sync.ts` pushes/pulls by uuid
        set-difference on login and auth changes (projects/settings still device-only)
  - [ ] manage from device to account when the user connects an account
        => same mechanism (`installSyncOnAuth`, wired in main.ts)
  - [ ] let the user still choose what to keep on the device
    - [ ] first slice: per-record delete offers exactly where it exists — device,
          cloud, or both; a cloud-delete marks the local copy `localOnly` so sync
          never re-pushes it
  - [ ] share between accounts
  - [ ] collaborative mode, live

### 2. Deployment
- [ ] Migrate from Netlify to OVH for the SPA
- [ ] Destroy previous nnvp.io hosting
- [ ] Destroy previous about.nnvp.io hosting

### Assistant (chat)
- [ ] conversation should survive closing/reopening the chat window (module store, like window rects)
      => superseded: conversations are now persistent records (IndexedDB) — they
      survive reloads, the latest one restores on page load, and the chat has
      "new conversation" + a resume list (backend-synced when signed in)
- [ ] context-limit compaction (for now a full conversation just stops; no
      auto-compaction, no summarize-into-new-conversation — deliberate)
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

### Training pause/resume
One local run = one `lib/Training/runController.ts` state machine (running →
paused ⇄ running → done); pause stops after the batch in flight, resume
continues the SAME warm model (optimizer state included) on a fresh slice,
charts/journal keep one absolute epoch axis (`WatchState`). Engines advertise
`capabilities.canPause` (tfjs yes, traced tinygrad no). Inspect asks to pause
via a modal when training runs; the initiating tab owns the Resume button.
- [ ] port the pause UI flows into dual scenarios (needs training-driver
      methods for pause/resume/modal in both worlds)
- [ ] live-probe mode: re-run Inspect every N batches WITHOUT pausing (GPU
      contention is why pause-first shipped)
- [ ] tinygrad canPause: pause at a traced-step boundary is easy; resume with
      (epochs, initialEpoch) needs the runner loop to accept segment bounds
- [ ] multi-run manager: several RunControllers (remote/cloud runs) beside the
      single local slot; the journal already records every run

### Curriculum training (pretrain → fine-tune)
The LLM story in miniature, and the natural final act of the poetry tutorial:
phase 1 trains on a broad corpus, phase 2 CONTINUES the same warm model on a
narrow one — the fixed 96-char vocab is what makes the embedding survive the
dataset switch, and RunController's segments are already the right execution
shape (a phase = segments with a dataset + epochs + optional lr).
- [ ] schedule on the controller: RunController takes phases[{dataset, epochs,
      label}] on one absolute epoch axis (per-phase lr: later, liveLr exists)
- [ ] Options UI: a "Fine-tune …on …for" block (two phases; N-phase list =
      later); epoch chart draws a dashed phase marker
- [ ] fixed-seed sample at every phase boundary, shown in the Charts tab
      ("same seed, before vs after fine-tuning")
  - [ ] journal the boundary samples into the run record (History re-view)
- [ ] flagship demo wired: pretrain GutenbergPoetryXL → fine-tune
      ShakespeareSonnets (~100KB corpus added exactly for this; both seqLen 96,
      pair with the GPT-Mini Poetry template); phase-2 help modal tells the
      catastrophic-forgetting story
- [ ] presented as "fine-tuning" (honest at this scale; RLHF/LoRA out of scope)
- [ ] port the fine-tune UI flow into dual scenarios (training driver methods)
- [ ] guard rail: warn in Options when phase datasets disagree on input shape
      (today it surfaces as the training-error alert)
- [ ] v2 UI — "training program" BLOCKS, superseding the fine-tune checkbox:
      an ordered list of blocks (dataset, epochs, later lr/optimizer), add /
      remove / reorder; live per-block progress (strip shows it already);
      RunController.phases is already the execution model, this is UI + config
      shape (phases array instead of phase2* fields)
  - [ ] add a block AFTER a run finished and continue the same warm model:
        keep the session (not just the model) + the run's WatchState; journal
        as a new record carrying a parentRunUuid link (records stay immutable)
  - [ ] per-block optimizer change = recompile = fresh optimizer state (honest
        "new phase" semantics); per-block LR without recompile via liveLr

### Transformer internals visualization
The TransformerBlock is one probed layer today — Inspect sees only its output.
Its sublayers (LN → per-head causal attention → residual → LN → FFN → residual)
can be exposed without exploding the board graph:
- [ ] capture mode on the custom tfjs layers: when a flag is set, call() also
      stashes chosen intermediates (attention weights [heads, T, T], ffn
      hidden) on the layer instance; the probe collects them after predict
      and publishes sub-entries per node
- [ ] the money viz: per-head causal attention heatmaps (T×T lower-triangular)
      — during Inspect-tab generation, "which past characters is the model
      looking at for THIS next char", stepping as the poem writes itself
      (activationSummary's tiles kind already renders stacks of 2D maps)
- [ ] display surface: expanded-node view or the 3D layer panel's channel
      pager (heads page like conv channels)

### Training run journal
Every Train click writes an immutable run record (uuid, compile options, graph
snapshot, per-epoch metrics, outcome) to IndexedDB; the training window's
History tab lists, re-views (curves), restores (graph + options, undo-able)
and deletes them; synced to the account by uuid when signed in. Future:
- [ ] weight snapshots behind an explicit button (`model.save('indexeddb://…')`
      — deliberately NOT auto-journaled, weights are megabytes)
- [ ] seeded, bit-identical replay (non-goal for now: restore-and-re-run only)
- [ ] lineage graph UI — runs → graph snapshots → project lineage rendered with
      Vue Flow itself
- [ ] journal the ?bench=1 A/B rows through the same journal (skipped: needs
      special-casing around BENCH_OPTS)

## Future Features

### Dataset registry & sources
Datasets today are a hardcoded client registry (`lib/JSDatasets/datasets-sources.ts`,
image sprites + char-level text corpora) fetched from one CDN dir. Planned: a
multi-source registry with stable identity and a trust hierarchy.
- [ ] id contract: lowercase slug, content-versioned (`gutenberg-poetry-v1`);
      identity = (slug, sha256) so "same id = same content" is machine-checked —
      same slug + different hash across sources is a hard, surfaced conflict
- [ ] tier 1 (built-in): compiled-in entries, SRI checksums pinned at build time
- [ ] tier 2 (external repos): user-added source URLs (env var `;`-list first,
      settings UI later); manifest carries checksums; per-dataset trust-on-first-use
      pin so silently changed content errors loudly
- [ ] registry records carry a `provenance` enum (`builtin` | `nnvp_manifest` |
      `hugging_face` | `croissant`) + a per-provenance `origin` substructure;
      loaders only ever see the normalized config — bridges are pure translators
- [ ] clear errors: source unreachable (non-fatal, others still merge);
      referenced id missing from every source (saves/tutorial/journal restore);
      per-dataset fetch/integrity failure (existing path)
- [ ] bridge: Croissant (MLCommons JSON-LD) — FileObject.contentUrl/sha256 map
      1:1 onto text-corpus entries; sprite-image layout is nnvp-specific so the
      bridge starts text-only; their `license` field is worth surfacing in the UI
- [ ] bridge: HuggingFace Hub — `org/name` + pinned git revision resolves over
      CORS-enabled `/resolve/<rev>/<file>` URLs; a pinned revision is immutable,
      which satisfies the id contract natively; realistic scope = HF repos hosting
      nnvp-format files (raw .txt works as-is for char-LM)
- [ ] host the poetry corpora (scripts/prepare_poetry_datasets.py output) on the
      datasets CDN and fill the `textChecksum: null` fields in datasets-sources.ts
- [ ] later: mirrors / re-hosting — the same id offered by several sources, with a
      per-source priority (e.g. a faster mirror first that doesn't carry everything);
      hash equality enforced across mirrors, and a WARN (not just a hard fail) when
      a source serves different bytes for a known id
- [ ] later: decide the SSOT for identity — uuid vs qualified slug. Current lean:
      qualified slug + sha256 as the user-visible reference (saves/tutorials/errors),
      optional publisher uuid as internal metadata for cross-provider aliasing;
      revisit when the mirror/priority feature lands (mirrors argue for uuid)
- v0 shim (shipped first, superseded by the sources list): `VITE_DATASETS_CDN` env
  override of the CDN base + dev proxy for the image datasets + gitignored
  `public/datasets/` corpora — lets the text templates be tested locally without
  breaking MNIST and without touching datasets-sources.ts

### Tutorial mode
- [x] Create a guided tutorial module for building models step-by-step
      (Tutorial menu + overlay with coachmarks, completion bars; the assistant can start one)
  - Reference: [Keras Sequential Model Guide](https://keras.io/guides/sequential_model/)
- [ ] tutorial from "What is a neural network" to "Your first LLM"
- [ ] tutorial: build attention by hand — single-head scaled dot-product
      attention from STOCK layers that train in-browser (Dense Q/K/V → Dot →
      Softmax → Dot with V → Add residual → LayerNormalization → FFN), ending
      on why TransformerBlock packages it (causal mask, multi-head, dropout —
      the parts stock layers cannot express)

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
