/**
 * The BROWSER world for dual-mode tests (see tests/harness/define.ts): the same
 * helper surface as worldBun.ts, implemented as real UI interaction —
 * catalog clicks, anchor drags, menu navigation — via Playwright.
 *
 * `page`/`canvas` are attached ONLY when building the world for an e2eOnly
 * test; appTest fns must stay implementation-blind.
 */
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import { EXPORT_MENU_LABELS, HELP_MODAL_ASK_SELECTOR } from './uiLabels';
import type FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import type { RecordStore, RecordStoreName, StoredRecord } from '../../src/lib/LocalStore/recordStore';
import { createFakeBackend } from './fakeBackend';
import type { FakeBackend } from './fakeBackend';
import type { CanvasDriver } from './canvas';
import type {
  BackendDriver, BoardDriver, CatalogDriver, ChartsDriver, ChatDriver, E2EWorld, Expect,
  HistoryDriver, ModelsDriver, RecordsDriver, TrainingDriver, WindowName, WindowsDriver, World,
} from './define';

// Dev-only debug handle main.ts installs (same local-typing pattern). `bus`
// is the app-wide event bus (src/lib/Events/bus) — typed structurally here so
// page.evaluate callbacks stay serializable-import-free.
type NnvpDebugWindow = Window & {
  nnvp: {
    debug: {
      graphEditor: FlowGraphEditor;
      recordStore: RecordStore;
      bus: { emit(type: 'auth.changed'): void };
      boardInterface: unknown;
    };
  };
};

export function makeBrowserWorld(page: Page, canvas: CanvasDriver, expect: Expect, options: { exposePage: true }): E2EWorld;
export function makeBrowserWorld(page: Page, canvas: CanvasDriver, expect: Expect, options?: { exposePage?: boolean }): World;
export function makeBrowserWorld(
  page: Page,
  canvas: CanvasDriver,
  expect: Expect,
  { exposePage = false }: { exposePage?: boolean } = {},
): World {
  const settle = () => page.waitForTimeout(60);

  const openMenu = async (title: string) => {
    await page.click(`#GeneralMenu .menuTitle:has-text("${title}")`);
    await page.waitForTimeout(40);
  };

  const board: BoardDriver = {
    async addLayer(name) {
      await page.click(`.LayerTemplate:has(.layer-template-name:text-is("${name}"))`);
      // Catalog drops land stacked (15px stagger); spread each new layer to a
      // deterministic grid slot so later anchor drags never fight overlap.
      await page.evaluate(() => {
        const editor = (window as unknown as NnvpDebugWindow).nnvp.debug.graphEditor;
        const nodes = editor.store.getNodes();
        const index = nodes.length - 1;
        editor.moveLayerTo(nodes[index]!.id, 80 + (index % 3) * 220, 60 + Math.floor(index / 3) * 140);
      });
      await settle();
    },
    async connect(sourceIndex, targetIndex) {
      await canvas.connect(page, sourceIndex, targetIndex);
      await settle();
    },
    async select(index) {
      const node = page.locator(canvas.layer).nth(index);
      const nodeId = (await node.getAttribute('data-id'))!;
      const centerOf = async (): Promise<[number, number]> => {
        const box = (await node.boundingBox())!;
        return [box.x + box.width / 2, box.y + box.height / 2];
      };
      // A template node can sit under a floating panel (or outside the
      // viewport): a click there hits the panel, not the node. Ask the DOM
      // who would receive the click, and only then reposition — the way the
      // old specs moved layers for drag room (positions are presentational;
      // wiring is recomputed from edges, so nothing semantic changes).
      const clickReachesNode = async ([x, y]: [number, number]) => page.evaluate(
        ([px, py, id, layerSelector]) => {
          const el = document.elementFromPoint(Number(px), Number(py));
          const hit = el && el.closest(String(layerSelector));
          return !!hit && hit.getAttribute('data-id') === id;
        },
        [x, y, nodeId, canvas.layer] as const,
      );
      let center = await centerOf();
      if (!(await clickReachesNode(center))) {
        await canvas.moveLayer(page, nodeId as unknown as Parameters<CanvasDriver['moveLayer']>[1], 450, 360);
        await settle();
        center = await centerOf();
      }
      await page.mouse.click(center[0], center[1]);
      await settle();
      // Selection is this verb's POSTCONDITION. The D3-era specs asserted
      // the .selected class before destructive actions; every caller now
      // inherits that guard, with the failure localized to the click.
      const selected = await node.evaluate(el => el.classList.contains('selected'));
      if (!selected) {
        throw new Error(`board.select(${index}): node did not gain .selected after the click`);
      }
    },
    async deleteSelected() {
      await page.keyboard.press('Backspace');
      await settle();
    },
    async undo() {
      await openMenu('Edit');
      await page.click('#GeneralMenu .menuItem:has-text("Undo")');
      await settle();
    },
    async redo() {
      await openMenu('Edit');
      await page.click('#GeneralMenu .menuItem:has-text("Redo")');
      await settle();
    },
    async loadTemplate(name) {
      await openMenu('File');
      await page.locator('#GeneralMenu .dropdown-item-content:text-is("Templates")').hover();
      await page.waitForTimeout(40);
      await page.click(`#GeneralMenu .dropdown-item-content:text-is("${name}")`);
      await page.waitForTimeout(150);
    },
    async clearBoard() {
      await openMenu('File');
      await page.click('#GeneralMenu .menuItem:has-text("New")');
      await settle();
    },
    async moveLayer(id, x, y) {
      await canvas.moveLayer(page, String(id), x, y);
      await settle();
    },
    layerCount: () => canvas.layerCount(page),
    edgeCount: () => canvas.edgeCount(page),
    layerLabels: () => canvas.layerLabels(page),
    async setComment(index, text) {
      // The user's path: select the layer, type in the options panel's
      // comment box, and blur (the box applies on change).
      await board.select(index);
      const input = page.locator('#layerOptions .layer-comment-input');
      await input.fill(text);
      await input.blur();
      await settle();
    },
    async comment(index) {
      await board.select(index);
      return page.locator('#layerOptions .layer-comment-input').inputValue();
    },
    graphJSON: () => page.evaluate(() => (window as unknown as NnvpDebugWindow).nnvp.debug.graphEditor.toJSON()),
    async loadJSON(json) {
      // Through the REAL facade (like every app load path) so its lifecycle
      // runs — migration, lineage, inspection clearing.
      await page.evaluate(async (raw) => {
        const bi = (window as unknown as NnvpDebugWindow).nnvp.debug.boardInterface as {
          loadGraphFromJSON(json: unknown): Promise<void>;
        };
        await bi.loadGraphFromJSON(raw);
      }, json);
      await settle();
    },
  };

  // Same contract as worldComponents.makeWindowsDriver, mapped onto the real
  // catalog ('a') and layer-options ('b') windows.
  const winSel = (name: WindowName) => (name === 'a' ? '#layerCatalog' : '#layerOptions');
  // Chromium drops synthetic mouse events with NEGATIVE coordinates (beyond
  // the far edges they deliver fine), so crush-drags aimed up/left must stop
  // at 1 instead of going far past zero. No upper cap: growth drags need to
  // travel below/right of the viewport (the side windows already touch its
  // bottom edge).
  const clampX = (x: number) => Math.max(1, x);
  const clampY = (y: number) => Math.max(1, y);
  const windows: WindowsDriver = {
    async open() {}, // both windows are on screen by default
    async isVisible(name) {
      return page.locator(winSel(name)).isVisible();
    },
    async close(name) {
      await page.click(`${winSel(name)} .floating-window-close`);
    },
    async position(name) {
      const box = (await page.locator(winSel(name)).boundingBox())!;
      return { x: box.x, y: box.y };
    },
    async size(name) {
      const box = (await page.locator(winSel(name)).boundingBox())!;
      return { width: box.width, height: box.height };
    },
    async zIndexOf(name) {
      return page.locator(winSel(name))
        .evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));
    },
    async raise(name) {
      const bar = (await page.locator(`${winSel(name)} .floating-window-titlebar`).boundingBox())!;
      await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2);
    },
    async dragBy(name, dx, dy) {
      const bar = (await page.locator(`${winSel(name)} .floating-window-titlebar`).boundingBox())!;
      const startX = bar.x + bar.width / 2;
      const startY = bar.y + bar.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
      await page.mouse.up();
      await settle();
    },
    async dragTo(name, x, y) {
      const box = (await page.locator(winSel(name)).boundingBox())!;
      await this.dragBy(name, x - box.x, y - box.y);
    },
    async dragPointerTo(name, x, y) {
      const bar = (await page.locator(`${winSel(name)} .floating-window-titlebar`).boundingBox())!;
      await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(clampX(x), clampY(y), { steps: 5 });
      await page.mouse.up();
      await settle();
    },
    async viewport() {
      return page.viewportSize()!;
    },
    async resizeBy(name, dx, dy) {
      const handle = (await page.locator(`${winSel(name)} .floating-window-resize`).boundingBox())!;
      const startX = handle.x + handle.width / 2;
      const startY = handle.y + handle.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(clampX(startX + dx), clampY(startY + dy), { steps: 5 });
      await page.mouse.up();
      await settle();
    },
    async resizeLeftEdgeBy(name, dx) {
      const strip = (await page.locator(`${winSel(name)} .fw-edge-w`).boundingBox())!;
      const startX = strip.x + strip.width / 2;
      const startY = strip.y + strip.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(clampX(startX + dx), clampY(startY), { steps: 5 });
      await page.mouse.up();
      await settle();
    },
    /** What size() reports at the minimum: min-width + the 2px of borders
        that boundingBox includes (the bun world reads style.width instead). */
    async expectedMinWidth(name) {
      return (name === 'a' ? 220 : 240) + 2;
    },
    /** boundingBox includes the 1px border on each side. */
    async borderOverhead() {
      return 2;
    },
    /** The app's default window rects (App.vue windowRects). */
    async defaults(name) {
      const { height } = page.viewportSize()!;
      return name === 'a'
        ? { width: 220, height: height - 68 }
        : { width: 240, height: height - 68 };
    },
    async toggleMaximize(name) {
      await page.click(`${winSel(name)} .floating-window-maximize`);
      await settle();
    },
  };

  // Same contract as worldComponents.makeChartsDriver, via the real app.
  const charts: ChartsDriver = {
    async open() {
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Training")');
      await page.click('.TrainingZone.bar-button:has-text("Charts")');
      await settle();
    },
    async helpText(which) {
      await page.click(`.chart-help >> nth=${which === 'batch' ? 0 : 1}`);
      await settle();
      const text = await page.locator('.layer-help-modal-body').textContent();
      await page.click('.layer-help-modal-close');
      await settle();
      return text;
    },
  };

  // Same contract as worldComponents.makeTrainingDriver, via the real app:
  // Panels > Training opens the window (v-if mounts TrainingZone), the
  // titlebar close button unmounts it.
  const training: TrainingDriver = {
    async open() {
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Training")');
      await page.click('.TrainingZone.bar-button:has-text("Options")');
      await settle();
    },
    async close() {
      await page.click('#trainingZone .floating-window-close');
      await settle();
    },
    async setOptimizer(name) {
      await page.selectOption('.optimizer-section select', name);
      await settle();
    },
    async setEpochs(value) {
      await page.fill('.training-params-section input[type="number"]', String(value));
      await settle();
    },
    async optimizer() {
      return page.$eval('.optimizer-section select', el => (el as HTMLSelectElement).value);
    },
    async epochs() {
      return page.$eval(
        '.training-params-section input[type="number"]',
        el => Number((el as HTMLInputElement).value),
      );
    },
    async openInspect() {
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Training")');
      await page.click('.TrainingZone.bar-button:has-text("Inspect")');
      await settle();
    },
    async weightsRow() {
      const status = page.locator('[data-testid="weights-status"]');
      const hint = page.locator('[data-testid="inspect-no-model-hint"]');
      const hasStatus = (await status.count()) > 0;
      const hasHint = (await hint.count()) > 0;
      return {
        downloadEnabled: await page.locator('[data-testid="weights-download-button"]').isEnabled(),
        loadEnabled: await page.locator('[data-testid="weights-load-button"]').isEnabled(),
        status: hasStatus ? (await status.textContent())!.trim() : null,
        statusIsError: hasStatus && ((await status.getAttribute('class')) ?? '').split(/\s+/).includes('inspect-error'),
        hint: hasHint ? (await hint.textContent())!.replace(/\s+/g, ' ').trim() : null,
      };
    },
    async loadWeightsFile(name, bytes) {
      // The chooser can't be clicked; Playwright feeds the hidden input directly.
      await page.setInputFiles('[data-testid="weights-file-input"]', {
        name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes),
      });
      // tfjs prepare (cpu) + digests: wait for the rendered outcome, not a fixed delay.
      await page.waitForSelector('[data-testid="weights-status"]', { timeout: 30000 });
      await settle();
    },
    async makeDatasetsUnreachable() {
      // Dev serves datasets same-origin under /datasets/ (vite proxies the
      // CDN); production builds fetch the CDN directly — abort both.
      await page.route(/\/datasets\//, route => route.abort('failed'));
    },
    async clickTrain() {
      await page.click('.train-button');
      await page.waitForFunction(() => {
        const button = document.querySelector('.train-button');
        return (button && !button.textContent!.includes('Stop'))
          || document.querySelector('[data-testid="train-start-error"]') !== null;
      }, null, { timeout: 30000 });
      await settle();
    },
    async trainButtonLabel() {
      return (await page.textContent('.train-button')) ?? '';
    },
    async startError() {
      const line = page.locator('[data-testid="train-start-error"]');
      return (await line.count()) > 0 ? line.textContent() : null;
    },
  };

  // Same contract as worldComponents.makeCatalogDriver, on the real catalog.
  const catalog: CatalogDriver = {
    async open() {}, // always mounted in the app
    async toggleAll() {
      await page.click('.collapse-all-button');
    },
    async toggleCategory(name) {
      await page.click(`[aria-label="Toggle ${name} layers"]`);
    },
    async masterArrowCollapsed() {
      const classes = (await page.locator('.collapse-all-arrow').getAttribute('class'))!;
      return classes.split(/\s+/).includes('collapsed');
    },
  };

  // Same contract as worldComponents.makeChatDriver, expressed as real UI.
  const chat: ChatDriver = {
    async setSignedIn(signedIn) {
      await page.evaluate((on) => {
        if (on) window.localStorage.setItem('nnvp_backend_token', 'test-token');
        else window.localStorage.removeItem('nnvp_backend_token');
        (window as unknown as NnvpDebugWindow).nnvp.debug.bus.emit('auth.changed');
      }, signedIn);
    },
    async open() {
      // Chat defaults to hidden; the Panels menu is the way in. Wait out the
      // entrance transition (translateY) so position measurements are stable.
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Chat")');
      await page.waitForTimeout(300);
    },
    async connectPromptVisible() {
      return (await page.locator('.chat-connect').count()) > 0;
    },
    async inputEnabled() {
      const input = page.locator('.chat-input');
      if ((await input.count()) === 0) return false;
      return input.isEnabled();
    },
    async settingsOpensAccountUsage() {
      await page.click('#chat-panel [aria-label="Settings"]');
      await settle();
      const panelOpen = (await page.locator('#account-modal-title').count()) > 0;
      const passwordFields = await page.locator('input[type="password"]').count();
      return panelOpen && passwordFields === 0;
    },
    async signInFromPrompt() {
      await page.click('.chat-connect button');
      await settle();
      return (await page.locator('#account-modal-title').count()) > 0;
    },
    /** The help-modal handoff, as real UI: catalog (?) button → footer ask.
        The (?) is hover-revealed, so hover the template row first. */
    async askAbout(topic) {
      await page.hover(`#layer-template-${topic}`);
      await page.click(`[aria-label="Learn about the ${topic} layer"]`);
      await settle();
      await page.click(HELP_MODAL_ASK_SELECTOR);
      await settle();
    },
    async lastAssistantText() {
      const bubbles = page.locator('.chat-msg-assistant .chat-bubble-text');
      const count = await bubbles.count();
      return count ? bubbles.nth(count - 1).textContent() : '';
    },
    async signInBlinking() {
      return (await page.locator('.chat-connect .chat-btn-blink').count()) > 0;
    },
    async windowPosition() {
      const box = (await page.locator('#chat-panel').boundingBox())!;
      return { x: box.x, y: box.y };
    },
    async dragWindowBy(dx, dy) {
      const bar = (await page.locator('#chat-panel .floating-window-titlebar').boundingBox())!;
      const startX = bar.x + bar.width / 2;
      const startY = bar.y + bar.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
      await page.mouse.up();
      await settle();
    },
    async closeWindow() {
      await page.click('#chat-panel .floating-window-close');
      await settle();
    },
    async startNewConversation() {
      await page.click('#chat-panel .chat-conv-new');
      await settle();
    },
    async conversationTitles() {
      const toggle = page.locator('#chat-panel .chat-conv-toggle');
      if (await toggle.getAttribute('aria-expanded') !== 'true') {
        await toggle.click();
        await settle();
      }
      return page.locator('#chat-panel .chat-conv-title').allTextContents();
    },
    async resumeConversation(index) {
      await page.locator('#chat-panel .chat-conv-item').nth(index).click();
      await settle();
    },
    async visibleMessageCount() {
      return page.locator('#chat-panel .chat-messages .chat-message').count();
    },
    async requestDeleteConversation(index) {
      const toggle = page.locator('#chat-panel .chat-conv-toggle');
      if (await toggle.getAttribute('aria-expanded') !== 'true') {
        await toggle.click();
        await settle();
      }
      await page.locator('#chat-panel .chat-conv-delete').nth(index).click();
      await settle();
      return page.locator('#chat-panel .chat-conv-del-choice').allTextContents();
    },
    async confirmDeleteConversation(label) {
      await page
        .locator('#chat-panel .chat-conv-del-choice, #chat-panel .chat-conv-del-cancel')
        .filter({ hasText: label })
        .first()
        .click();
      await settle();
    },
  };

  // Seed/read the app's REAL store through the dev-only debug handle — the
  // same instance every component reaches via getRecordStore(). Records cross
  // into the page as structured clones, which their JSON-safety guarantees.
  const records: RecordsDriver = {
    async seed(store, recordList) {
      await page.evaluate(async ({ storeName, list }) => {
        const appStore = (window as unknown as NnvpDebugWindow).nnvp.debug.recordStore;
        for (const record of list) await appStore.put(storeName, record);
      }, { storeName: store, list: recordList });
    },
    async list<T extends StoredRecord>(store: RecordStoreName) {
      return page.evaluate(
        storeName => (window as unknown as NnvpDebugWindow).nnvp.debug.recordStore
          .list(storeName),
        store,
      ) as Promise<T[]>;
    },
  };

  // The fake /api lives in the RUNNER process; page.route hands it every
  // request before the network (so before vite's /api proxy). Requests the
  // router disowns continue to the real (absent) backend and fail exactly
  // like a missing server.
  let fakeBackend: FakeBackend | null = null;
  let backendRouted = false;
  const backend: BackendDriver = {
    async serve(data) {
      fakeBackend = createFakeBackend(data);
      if (backendRouted) return; // re-serve just swaps the state behind the route
      backendRouted = true;
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const answer = fakeBackend!.handle(request.method(), request.url(), request.postData());
        if (!answer) return route.continue();
        return route.fulfill({
          status: answer.status,
          body: answer.body ?? undefined,
          contentType: answer.body === null ? undefined : 'application/json',
        });
      });
    },
    async uuids(kind) {
      return fakeBackend ? [...fakeBackend.state[kind].keys()] : [];
    },
  };

  // Same contract as worldComponents.makeHistoryDriver, via the real app:
  // Panels > Training opens the window, the History tab bar-button lands on
  // the panel.
  const history: HistoryDriver = {
    async open() {
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Training")');
      await page.click('.TrainingZone.bar-button:has-text("History")');
      await settle();
    },
    async close() {
      await page.click('#trainingZone .floating-window-close');
      await settle();
    },
    async rowCount() {
      return page.locator('.history-row').count();
    },
    async rowText(index) {
      return (await page.locator('.history-row').nth(index).textContent()) ?? '';
    },
    async emptyText() {
      const empty = page.locator('.history-empty');
      return (await empty.count()) ? empty.first().textContent() : null;
    },
    async view(index) {
      await page.locator('.history-view').nth(index).click();
      await settle();
    },
    async curvesVisible() {
      return (await page.locator('.history-curves').count()) > 0;
    },
    async curveSeriesCount() {
      return page.locator('.history-curves .lines path').count();
    },
    async curvesText() {
      return (await page.locator('.history-curves').textContent()) ?? '';
    },
    async restore(index) {
      await page.locator('.history-restore').nth(index).click();
      await settle();
    },
    async requestDelete(index) {
      await page.locator('.history-delete').nth(index).click();
      // The offered buttons appear once the deleteChoices promise lands —
      // there is always at least one (the panel degrades to ['local']).
      await page.waitForSelector('.history-confirm-delete');
      return page.locator('.history-confirm-delete').allTextContents();
    },
    async confirmDelete(label) {
      await page
        .locator('.history-confirm-delete, .history-cancel-delete')
        .filter({ hasText: label })
        .first()
        .click();
      await settle();
    },
    async groupHeaders() {
      return page.locator('.history-group').allTextContents();
    },
    async setFilter(name, value) {
      await page.selectOption(`.history-filters select[data-filter="${name}"]`, value);
      await settle();
    },
    async setShowHidden(on) {
      await page.locator('.history-show-hidden input').setChecked(on);
      await settle();
    },
    async unhide(index) {
      await page.locator('.history-unhide').nth(index).click();
      await settle();
    },
    async provenanceText() {
      const line = page.locator('.history-provenance');
      return (await line.count()) ? (await line.first().textContent()) ?? '' : '';
    },
    async selectForCompare(index) {
      await page.locator('.history-compare-check').nth(index).setChecked(true);
      await settle();
    },
    async compare() {
      await page.locator('.history-compare-button').click();
      await settle();
    },
    async compareText() {
      return (await page.locator('.ComparePanel').textContent()) ?? '';
    },
    async compareSeriesCount() {
      return page.locator('.compare-chart .lines path').count();
    },
  };

  const models: ModelsDriver = {
    async open() {
      await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
      await page.click('#GeneralMenu .menuItem:has-text("Models")');
      await settle();
    },
    async close() {
      await page.click('#modelsWindow .floating-window-close');
      await settle();
    },
    async text() {
      return (await page.locator('#modelsWindow .ModelsWindow').textContent()) ?? '';
    },
    async showGraph() {
      await page.click('#modelsWindow .models-view-graph');
      // Big journals hash for a while — wait for the panel's answer, either
      // rendered nodes or the empty line (same reasoning as the bun world).
      await page.waitForSelector('#modelsWindow .evolution-node, #modelsWindow .models-empty');
      await settle();
    },
    async nodeCount() {
      return page.locator('#modelsWindow .evolution-node').count();
    },
    async select(index) {
      await page.locator('#modelsWindow .evolution-node').nth(index).click();
      await settle();
    },
    async next() {
      await page.click('#modelsWindow .models-next');
      await settle();
    },
    async prev() {
      await page.click('#modelsWindow .models-prev');
      await settle();
    },
    async previewBoxCount() {
      return page.locator('#modelsWindow .models-preview rect').count();
    },
    async loadSelected() {
      await page.click('#modelsWindow .models-load');
      await settle();
    },
    async setFilter(name, value) {
      const selector = `#modelsWindow [data-mfilter="${name}"]`;
      const tag = await page.$eval(selector, el => el.tagName);
      if (tag === 'SELECT') await page.selectOption(selector, value);
      else await page.fill(selector, value);
      await settle();
    },
    async toggleOrder() {
      await page.click('#modelsWindow .models-order');
      await settle();
    },
    async showMap() {
      await page.click('#modelsWindow .models-view-map');
      await page.waitForSelector('#modelsWindow .evolution-map-node, #modelsWindow .models-empty');
      await settle();
    },
    async mapNodeCount() {
      return page.locator('#modelsWindow .evolution-map-node').count();
    },
    async mapThumbBoxCount() {
      return page.locator('#modelsWindow .map-thumb rect').count();
    },
    async selectMapNode(index) {
      await page.locator('#modelsWindow .evolution-map-node').nth(index).click();
      await settle();
    },
    async rate(value) {
      // Range inputs refuse fill(); set the value and fire change directly.
      await page.$eval('#modelsWindow .models-rating-slider', (el, v) => {
        const input = el as HTMLInputElement;
        input.value = String(v);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await settle();
    },
    async mapZoom(deltaY) {
      await page.locator('#modelsWindow .evolution-map').dispatchEvent('wheel', { deltaY, ctrlKey: true });
      await settle();
    },
    async mapClusterCount() {
      return page.locator('#modelsWindow .map-cluster').count();
    },
    async openFiles() {
      await page.click('#modelsWindow .models-view-files');
      await page.waitForSelector('#modelsWindow .models-files');
      await settle();
    },
    async filesText() {
      return (await page.locator('#modelsWindow .models-files').textContent()) ?? '';
    },
    async newFolder(name) {
      await page.fill('#modelsWindow .files-new-input', name);
      await page.click('#modelsWindow .files-new-btn');
      await settle();
    },
    async openFolder(name) {
      await page.locator(`#modelsWindow .files-subfolder:has(.files-subfolder-name:text-is("${name}"))`)
        .first().dblclick();
      await settle();
    },
    async filesUp() {
      await page.locator('#modelsWindow .files-crumb').nth(-2).click();
      await settle();
    },
    async filesBack() {
      await page.click('#modelsWindow .files-back');
      await settle();
    },
    async filesForward() {
      await page.click('#modelsWindow .files-forward');
      await settle();
    },
    async favoriteSelected() {
      await page.click('#modelsWindow .models-fav');
      await settle();
    },
    async startSaveTo() {
      await page.click('#modelsWindow .models-save-to');
      await page.waitForSelector('#modelsWindow .files-saving-banner');
      await settle();
    },
    async saveHere() {
      await page.click('#modelsWindow .files-save-here');
      await settle();
    },
    async fileLoad(index) {
      await page.locator('#modelsWindow .files-entry-load').nth(index).click();
      await settle();
    },
    async selectEntry(index) {
      await page.locator('#modelsWindow .files-entry').nth(index).click();
      await settle();
    },
    async selectFolder(name) {
      await page.locator(`#modelsWindow .files-subfolder:has(.files-subfolder-name:text-is("${name}"))`)
        .first().click();
      await settle();
    },
    async deleteSelected() {
      await page.click('#modelsWindow .files-delete');
      await settle();
    },
    async confirmDialog() {
      await page.click('#modelsWindow .files-dialog-confirm');
      await settle();
    },
    async renameSelected(newName) {
      await page.click('#modelsWindow .files-rename');
      await page.fill('#modelsWindow .files-dialog-input', newName);
      await page.click('#modelsWindow .files-dialog-confirm');
      await settle();
    },
    async cutSelected() {
      await page.click('#modelsWindow .files-cut');
      await settle();
    },
    async copySelected() {
      await page.click('#modelsWindow .files-copy');
      await settle();
    },
    async paste() {
      await page.click('#modelsWindow .files-paste');
      await settle();
    },
  };

  // The top menubar as real pixels — the same selectors and settle-waits the
  // migrated D3-era specs used (menus open on click; submenus on hover).
  const menu = {
    async open(title: string) {
      await page.click(`#GeneralMenu .menuTitle:text-is("${title}")`);
      await page.waitForTimeout(30);
    },
    async hoverSub(label: string) {
      await (await page.$(`text=${label}`))!.hover();
      await page.waitForTimeout(50);
    },
    async entries(subLabel: string) {
      return page.$$eval(
        `.menuItem:has-text("${subLabel}") > .dropdown-content > .menuItem`,
        els => els.map(el => (el.textContent ?? '').trim()),
      );
    },
    async clickItem(label: string) {
      await (await page.$(`text=${label}`))!.click();
      await page.waitForTimeout(100);
    },
  };
  // Real download events, artifacts read back from disk.
  const downloads = {
    async capture(action: () => Promise<void>) {
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await action();
      const download = await downloadPromise;
      if (!download) return null;
      return {
        filename: download.suggestedFilename(),
        content: fs.readFileSync((await download.path()), 'utf-8'),
      };
    },
  };
  // The old specs' beforeEach: attach collectors, then (re)load the app so
  // load-time errors are captured too.
  const errors = {
    async startTracking() {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (error) => {
        consoleErrors.push(`PAGE ERROR: ${error.message}`);
      });
      await page.goto(canvas.home);
      await page.waitForTimeout(50);
      return { async count() { return consoleErrors.length; } };
    },
  };
  // The Layer Options panel as real pixels — the same selectors the D3-era
  // specs used (#layerOptions text; typed inputs inside #layeroptions-block,
  // committed with a change event).
  const panel = {
    async text() {
      return (await page.textContent('#layerOptions')) ?? '';
    },
    async inputCount(type: 'number' | 'text' | 'range') {
      return (await page.$$(`#layeroptions-block input[type="${type}"]`)).length;
    },
    async inputValue(type: 'number' | 'text' | 'range', index: number) {
      const input = (await page.$$(`#layeroptions-block input[type="${type}"]`))[index]!;
      return input.inputValue();
    },
    async setInput(type: 'number' | 'text' | 'range', index: number, value: string) {
      const input = (await page.$$(`#layeroptions-block input[type="${type}"]`))[index]!;
      await input.fill(value);
      await input.dispatchEvent('change');
      await page.waitForTimeout(100); // Vue reactivity, as the old specs waited
    },
    async selectCount() {
      return (await page.$$('#layeroptions-block select')).length;
    },
    async selectValue(index: number) {
      const select = (await page.$$('#layeroptions-block select'))[index]!;
      return select.evaluate(el => (el as HTMLSelectElement).value);
    },
    async setSelect(index: number, value: string) {
      const select = (await page.$$('#layeroptions-block select'))[index]!;
      await select.selectOption(value);
      await select.dispatchEvent('change');
      await page.waitForTimeout(100);
    },
  };
  // The facade's inspection lifecycle, through the app's REAL
  // $boardInterface (dev debug handle). Reads still await
  // whenInspectionSettled() (an immediate resolve since the guard went
  // synchronous), mirroring the bun driver.
  const inspection = {
    async seed(byLayerId: Record<string, unknown>, options?: { settle?: boolean }) {
      await page.evaluate(async ([snapshot, settle]) => {
        const w = window as unknown as { __nnvpInvalidated?: number } & NnvpDebugWindow;
        const bi = w.nnvp.debug.boardInterface as {
          on(event: string, cb: () => void): void;
          setInspection(data: unknown): void;
          whenInspectionSettled(): Promise<void>;
        };
        if (w.__nnvpInvalidated === undefined) {
          w.__nnvpInvalidated = 0;
          bi.on('inspection-invalidated', () => { w.__nnvpInvalidated! += 1; });
        }
        bi.setInspection({ byLayerId: snapshot });
        if (settle) await bi.whenInspectionSettled();
      }, [byLayerId, options?.settle !== false] as const);
    },
    async get() {
      return page.evaluate(async () => {
        const bi = (window as unknown as NnvpDebugWindow).nnvp.debug.boardInterface as {
          getInspection(): unknown; whenInspectionSettled(): Promise<void>;
        };
        await bi.whenInspectionSettled();
        return bi.getInspection() ?? null;
      });
    },
    async setVizParams(layerId: string, params: Record<string, unknown>) {
      await page.evaluate(([id, p]) => {
        const bi = (window as unknown as NnvpDebugWindow).nnvp.debug.boardInterface as {
          setLayerVizParams(layerId: string, params: unknown): void;
        };
        bi.setLayerVizParams(String(id), p);
      }, [layerId, params] as const);
    },
    async vizParamsCount() {
      return page.evaluate(async () => {
        const bi = (window as unknown as NnvpDebugWindow).nnvp.debug.boardInterface as {
          layerVizParams: Record<string, unknown>; whenInspectionSettled(): Promise<void>;
        };
        await bi.whenInspectionSettled();
        return Object.keys(bi.layerVizParams).length;
      });
    },
    async invalidatedCount() {
      return page.evaluate(async () => {
        const w = window as unknown as { __nnvpInvalidated?: number } & NnvpDebugWindow;
        const bi = w.nnvp.debug.boardInterface as { whenInspectionSettled(): Promise<void> };
        await bi.whenInspectionSettled();
        return w.__nnvpInvalidated ?? 0;
      });
    },
  };
  const world: World & { page?: Page; canvas?: CanvasDriver } = {
    expect, board, chat, catalog, windows, charts, training, history, models, records, backend,
    menu, downloads, errors, panel, inspection,
    dispose: async () => {},
  };
  if (exposePage) {
    world.page = page;
    world.canvas = canvas;
  }
  return world;
}
