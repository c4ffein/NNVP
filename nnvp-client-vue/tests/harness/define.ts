/**
 * THE test-definition helper. Every test in this repo is declared through one
 * of these three functions — never through bun:test / @playwright/test
 * directly (runners excepted). Definitions live in tests/suites/*.js
 * and are executed by BOTH runners:
 *
 *   - bun:        tests/harness/bun.test.ts        (`bun run test:fast`)
 *   - playwright: tests/harness/playwright.spec.ts (`bun run test:e2e*`)
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
import type { Page } from '@playwright/test';
import type { NnvpLayerId, NnvpModel } from '../../src/types/model';
import type { RecordStoreName, StoredRecord } from '../../src/lib/LocalStore/recordStore';
import type { CanvasDriver } from './canvas';

// --- The world contract ------------------------------------------------------
// One helper surface, two implementations: worldBun.ts/worldComponents.ts
// (direct JS + mounted SFCs) and worldBrowser.ts (real UI via Playwright).
// These interfaces are the INTERSECTION contract as suites consume it — where
// the two worlds' return types diverge (e.g. Playwright's textContent may be
// null where test-utils' text() is a string), the wider type is used. Suites
// must rely only on what is typed here.

/**
 * The assertion entrypoint handed to every test. Each runner injects its own
 * implementation (bun:test's `expect` under bun, @playwright/test's in the
 * browser runner); the two libraries share the common matcher surface but no
 * nominal type, so the matcher object stays `any` at this seam.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Expect = (actual: unknown, message?: string) => any;

/** What logicTest fns receive: assertions only, no app. */
export interface LogicWorld {
  expect: Expect;
}

/** The two floating windows the windows driver addresses (see worldComponents). */
export type WindowName = 'a' | 'b';

/** The graph board: catalog drops, connections, selection, undo/redo, JSON. */
export interface BoardDriver {
  addLayer(name: string): Promise<void>;
  connect(sourceIndex: number, targetIndex: number): Promise<void>;
  select(index: number): Promise<void>;
  deleteSelected(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  loadTemplate(name: string): Promise<void>;
  clearBoard(): Promise<void>;
  moveLayer(id: NnvpLayerId, x: number, y: number): Promise<void>;
  layerCount(): Promise<number>;
  edgeCount(): Promise<number>;
  layerLabels(): Promise<(string | null)[]>;
  /** Set the free-text comment on the layer at `index` (as the options
   *  panel's comment box does); blank clears it. */
  setComment(index: number, text: string): Promise<void>;
  /** The layer's comment; '' when it has none (what an empty box shows). */
  comment(index: number): Promise<string>;
  /** The committed NNVP model as a JSON string (FlowGraphEditor.toJSON). */
  graphJSON(): Promise<string>;
  loadJSON(json: string | NnvpModel): Promise<void>;
}

/** Two floating windows ('a'/'b'): visibility, geometry, stacking, drags. */
export interface WindowsDriver {
  open(): Promise<void>;
  isVisible(name: WindowName): Promise<boolean>;
  close(name: WindowName): Promise<void>;
  position(name: WindowName): Promise<{ x: number; y: number }>;
  size(name: WindowName): Promise<{ width: number; height: number }>;
  zIndexOf(name: WindowName): Promise<number>;
  raise(name: WindowName): Promise<void>;
  dragBy(name: WindowName, dx: number, dy: number): Promise<void>;
  dragTo(name: WindowName, x: number, y: number): Promise<void>;
  /** Grab the titlebar, then move the POINTER to exact viewport coords. */
  dragPointerTo(name: WindowName, x: number, y: number): Promise<void>;
  viewport(): Promise<{ width: number; height: number }>;
  resizeBy(name: WindowName, dx: number, dy: number): Promise<void>;
  resizeLeftEdgeBy(name: WindowName, dx: number): Promise<void>;
  /** What size() reports at the minimum width (world-specific border terms). */
  expectedMinWidth(name: WindowName): Promise<number>;
  /** What size() adds over the style width (borders, if measured). */
  borderOverhead(): Promise<number>;
  /** The initial (default) rect the named window opens with. */
  defaults(name: WindowName): Promise<{ width: number; height: number }>;
  /** Click the titlebar's maximize/restore toggle (Phase G3). */
  toggleMaximize(name: WindowName): Promise<void>;
}

/** The training Charts tab and its per-chart help modals. */
export interface ChartsDriver {
  open(): Promise<void>;
  helpText(which: 'batch' | 'epoch'): Promise<string | null>;
}

/**
 * The Training window's compile options (Options tab). open() opens the
 * Training window ON its Options tab; close() closes the whole window (which
 * unmounts TrainingZone, exactly like the app's v-if). Reads return what the
 * rendered form shows.
 */
export interface TrainingDriver {
  open(): Promise<void>;
  close(): Promise<void>;
  setOptimizer(name: string): Promise<void>;
  setEpochs(value: number): Promise<void>;
  optimizer(): Promise<string>;
  epochs(): Promise<number>;
  /** Open the Training window ON its Inspect tab (where the weights row lives). */
  openInspect(): Promise<void>;
  /** The Inspect tab's weights row + hint, as rendered. */
  weightsRow(): Promise<WeightsRowState>;
  /**
   * Hand a file to "Load weights…" through the real <input type=file> and
   * wait for the row to report an outcome (success or refusal).
   */
  loadWeightsFile(name: string, bytes: Uint8Array): Promise<void>;
}

/** What the Inspect tab's weights row shows. */
export interface WeightsRowState {
  downloadEnabled: boolean;
  loadEnabled: boolean;
  /** The last outcome line, null when none has been reported yet. */
  status: string | null;
  statusIsError: boolean;
  /** The "train a model first" hint, null once a model (trained or restored) exists. */
  hint: string | null;
}

/** The layer catalog's collapse/expand surface. */
export interface CatalogDriver {
  open(): Promise<void>;
  toggleAll(): Promise<void>;
  toggleCategory(name: string): Promise<void>;
  /** True when the master arrow offers "expand all" (fully collapsed). */
  masterArrowCollapsed(): Promise<boolean>;
}

/** The assistant chat window: auth boundary, prompts, window management. */
export interface ChatDriver {
  /** Sign in/out by controlling the real localStorage boundary. */
  setSignedIn(signedIn: boolean): Promise<void>;
  open(): Promise<void>;
  connectPromptVisible(): Promise<boolean>;
  inputEnabled(): Promise<boolean>;
  /** The gear's contract: it opens the account panel at the usage section. */
  settingsOpensAccountUsage(): Promise<boolean>;
  signInFromPrompt(): Promise<boolean>;
  /** The help-modal handoff: ask the assistant about a layer topic. */
  askAbout(topic: string): Promise<void>;
  lastAssistantText(): Promise<string | null>;
  signInBlinking(): Promise<boolean>;
  windowPosition(): Promise<{ x: number; y: number }>;
  dragWindowBy(dx: number, dy: number): Promise<void>;
  closeWindow(): Promise<void>;
  /** Click the "+ New" control: persist the current conversation, start fresh. */
  startNewConversation(): Promise<void>;
  /** Open the conversations drawer (if closed) and return its titles, newest first. */
  conversationTitles(): Promise<string[]>;
  /** Click the drawer row at `index` (same order conversationTitles returned). */
  resumeConversation(index: number): Promise<void>;
  /** How many message rows the panel currently renders. */
  visibleMessageCount(): Promise<number>;
  /** Click the × on the drawer row at `index` (opening the drawer if needed);
   *  returns the offered delete-location labels ("device"/"cloud"/"both"). */
  requestDeleteConversation(index: number): Promise<string[]>;
  /** Click the inline confirm button with that exact label (or "Cancel"). */
  confirmDeleteConversation(label: string): Promise<void>;
}

/**
 * The app's record store, as tests reach it: seed state the UI should find,
 * read back what the UI left. The bun world injects a fresh MemoryRecordStore
 * per test (setRecordStoreForTests); the browser world goes through the app's
 * REAL store via the dev-only window.nnvp.debug.recordStore handle — records
 * must therefore stay JSON-safe (they are by contract).
 */
export interface RecordsDriver {
  seed(store: RecordStoreName, records: StoredRecord[]): Promise<void>;
  list<T extends StoredRecord>(store: RecordStoreName): Promise<T[]>;
}

/** The Training window's History tab, as the user works it. open() opens the
 *  Training window ON its History tab; close() closes the whole window. */
export interface HistoryDriver {
  open(): Promise<void>;
  close(): Promise<void>;
  rowCount(): Promise<number>;
  rowText(index: number): Promise<string>;
  /** The muted empty-journal line, or null when the table is showing. */
  emptyText(): Promise<string | null>;
  /** Click the row's View/Hide toggle. */
  view(index: number): Promise<void>;
  curvesVisible(): Promise<boolean>;
  /** SVG series lines in the expanded curves chart. */
  curveSeriesCount(): Promise<number>;
  curvesText(): Promise<string>;
  restore(index: number): Promise<void>;
  /** Click the row's Delete; returns the offered location labels
   *  ("device"/"cloud"/"both") once they have loaded. */
  requestDelete(index: number): Promise<string[]>;
  /** Click the inline confirm button with that exact label (or "Cancel"). */
  confirmDelete(label: string): Promise<void>;
  /** The per-architecture group header texts, top to bottom. */
  groupHeaders(): Promise<string[]>;
  /** Set a filter select ('dataset'|'outcome'|'ranOn'|'lib'); '' = all. */
  setFilter(name: string, value: string): Promise<void>;
  /** Toggle the show-hidden checkbox (re-lists with hidden runs included). */
  setShowHidden(on: boolean): Promise<void>;
  /** Click the row's Unhide (shown on hidden rows in the show-hidden view). */
  unhide(index: number): Promise<void>;
  /** The provenance line inside the expanded detail row ('' when closed). */
  provenanceText(): Promise<string>;
  /** Tick the row's compare checkbox. */
  selectForCompare(index: number): Promise<void>;
  /** Click "Compare (n)" — TrainingZone switches to the Compare tab. */
  compare(): Promise<void>;
  /** The whole Compare panel's text (verdict, config diff, empty hint). */
  compareText(): Promise<string>;
  /** SVG series lines in the Compare overlay chart. */
  compareSeriesCount(): Promise<number>;
}

/** The Models window (Phase G3): the architecture story as its own window —
 *  timeline list, evolution graph, read-only preview, explicit restore. */
export interface ModelsDriver {
  /** Open the Models window (Panels > Models in the browser). */
  open(): Promise<void>;
  close(): Promise<void>;
  /** The whole window's text (list steps, node labels, empty hint). */
  text(): Promise<string>;
  /** Switch to the graph view (list is the default). */
  showGraph(): Promise<void>;
  /** Rendered evolution-graph state nodes. */
  nodeCount(): Promise<number>;
  /** Select the state node at `index` (preview only — never the board). */
  select(index: number): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  /** Boxes drawn in the read-only preview SVG. */
  previewBoxCount(): Promise<number>;
  /** Click "Load this state" — the one board mutation, undoable. */
  loadSelected(): Promise<void>;
  /** Set a shared filter-bar control ('from'|'to' dates, 'seen', 'when'). */
  setFilter(name: string, value: string): Promise<void>;
  /** Click the order button (newest-first ⇄ oldest-first, both views). */
  toggleOrder(): Promise<void>;
  /** Switch to the Map tab (states as a 2D canvas-style graph). */
  showMap(): Promise<void>;
  /** Rendered map cards. */
  mapNodeCount(): Promise<number>;
  /** Architecture boxes drawn inside the cards' thumbnails, all cards. */
  mapThumbBoxCount(): Promise<number>;
  /** Click the map card at `index` (selection only — never the board). */
  selectMapNode(index: number): Promise<void>;
  /** Move the detail strip's rating slider for the SELECTED state (0..1000). */
  rate(value: number): Promise<void>;
  /** Wheel-zoom the Map (positive delta zooms out — Obsidian semantics). */
  mapZoom(deltaY: number): Promise<void>;
  /** Rendered cluster blobs at the coarsest zoom level. */
  mapClusterCount(): Promise<number>;
  /** Switch to the Files tab (the folder namespace, Phase H5). */
  openFiles(): Promise<void>;
  /** The Files tab's full text (folders, entries, empty hints). */
  filesText(): Promise<string>;
  /** Create a folder (one segment) under the CURRENT Files location. */
  newFolder(name: string): Promise<void>;
  /** Click into a subfolder of the current Files location. */
  openFolder(name: string): Promise<void>;
  /** Navigate to the parent (clicks the parent breadcrumb, Drive-style). */
  filesUp(): Promise<void>;
  /** The ← / → history arrows. */
  filesBack(): Promise<void>;
  filesForward(): Promise<void>;
  /** Toggle ★ /favorites for the SELECTED state (detail strip). */
  favoriteSelected(): Promise<void>;
  /** Start the Save-As flow for the SELECTED state (opens Files saving). */
  startSaveTo(): Promise<void>;
  /** In saving mode: link the saved model into the current folder. */
  saveHere(): Promise<void>;
  /** Click Load on the nth Files entry (the one board mutation). */
  fileLoad(index: number): Promise<void>;
  /** Toggle selection of the nth model entry (file-manager grammar). */
  selectEntry(index: number): Promise<void>;
  /** Toggle selection of a subfolder by name. */
  selectFolder(name: string): Promise<void>;
  /** Click Delete in the selection bar (opens the confirmation dialog). */
  deleteSelected(): Promise<void>;
  /** Confirm the open dialog (delete or rename). */
  confirmDialog(): Promise<void>;
  /** Open Rename for the single selected folder and type the new name. */
  renameSelected(newName: string): Promise<void>;
  /** Cut / copy the selected entries; paste into the current folder. */
  cutSelected(): Promise<void>;
  copySelected(): Promise<void>;
  paste(): Promise<void>;
}

/** What the fake backend holds, full records per kind (lists serve uuid
 *  projections of these, exactly like the real server). `events` seeds the
 *  event endpoints, given CLIENT-shaped (camelCase DomainEvent) events — the
 *  fake stores them in the wire shape like the real server would. */
export interface BackendFakeData {
  runs?: StoredRecord[];
  conversations?: StoredRecord[];
  events?: DomainEventLike[];
}

/** Structural stand-in for src DomainEvent (keeps define.ts's import surface
 *  small; the fake maps it through the real eventToWire). */
export interface DomainEventLike {
  uuid: string;
  type: string;
  streamId: string | null;
  deviceId: string;
  instanceId: string;
  seq: number;
  dependsOn: string[];
  wallTime: string;
  payload: unknown;
}

/**
 * A fake same-origin /api. serve() must be called BEFORE the first request
 * the test cares about — in particular before chat.setSignedIn(true), which
 * triggers a real sync pass (the worlds run the app's installAppServices
 * wiring). The bun world installs a fetch shim at world boot (live until
 * serve() feeds it, requests fall through to real fetch); the browser world
 * intercepts with page.route — either way the app's own ApiClient talks.
 */
export interface BackendDriver {
  serve(data: BackendFakeData): Promise<void>;
  /** The uuids the fake currently holds for a kind (deletes shrink it). */
  uuids(kind: RecordStoreName): Promise<string[]>;
}

/** What appTest fns receive (in BOTH modes). */
export interface World extends LogicWorld {
  board: BoardDriver;
  chat: ChatDriver;
  catalog: CatalogDriver;
  windows: WindowsDriver;
  charts: ChartsDriver;
  training: TrainingDriver;
  history: HistoryDriver;
  models: ModelsDriver;
  records: RecordsDriver;
  backend: BackendDriver;
  /** Bun world only (unmount + reset between tests); the runner calls it, suites never do. */
  dispose?: () => Promise<void>;
}

/** What e2eOnly fns additionally receive: the real page and canvas driver. */
export interface E2EWorld extends World {
  page: Page;
  canvas: CanvasDriver;
}

// --- The registry ------------------------------------------------------------

/** options (all optional): { timeoutMs } — a per-test timeout for tests that
 *  legitimately run long (real training, big dataset loads). */
export interface TestOptions {
  timeoutMs?: number;
}

export type TestFn<W> = (world: W) => void | Promise<void>;

interface EntryBase {
  name: string;
  options: TestOptions;
}

export interface LogicEntry extends EntryBase {
  kind: 'logic';
  mode: 'both';
  fn: TestFn<LogicWorld>;
}

export interface AppEntry extends EntryBase {
  kind: 'app';
  mode: 'both';
  fn: TestFn<World>;
}

export interface E2EEntry extends EntryBase {
  kind: 'app';
  mode: 'e2e';
  reason: string;
  fn: TestFn<E2EWorld>;
}

export type RegistryEntry = LogicEntry | AppEntry | E2EEntry;

const registry: RegistryEntry[] = [];

function register(entry: RegistryEntry): void {
  if (!entry.name || typeof entry.fn !== 'function') {
    throw new Error('dual/define: a test needs a name and a function');
  }
  if (registry.some(existing => existing.name === entry.name)) {
    throw new Error(`dual/define: duplicate test name "${entry.name}"`);
  }
  registry.push(entry);
}

export function appTest(name: string, fn: TestFn<World>, options: TestOptions = {}): void {
  register({
    name, fn, kind: 'app', mode: 'both', options,
  });
}

export function logicTest(name: string, fn: TestFn<LogicWorld>, options: TestOptions = {}): void {
  register({
    name, fn, kind: 'logic', mode: 'both', options,
  });
}

export function e2eOnly(name: string, reason: string, fn: TestFn<E2EWorld>, options: TestOptions = {}): void {
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

export function getRegistry(): RegistryEntry[] {
  return registry;
}
