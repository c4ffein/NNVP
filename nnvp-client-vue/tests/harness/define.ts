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
}

/** The training Charts tab and its per-chart help modals. */
export interface ChartsDriver {
  open(): Promise<void>;
  helpText(which: 'batch' | 'epoch'): Promise<string | null>;
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
}

/** What appTest fns receive (in BOTH modes). */
export interface World extends LogicWorld {
  board: BoardDriver;
  chat: ChatDriver;
  catalog: CatalogDriver;
  windows: WindowsDriver;
  charts: ChartsDriver;
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
