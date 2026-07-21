/**
 * The BROWSER world for dual-mode tests (see tests/harness/define.ts): the same
 * helper surface as worldBun.ts, implemented as real UI interaction —
 * catalog clicks, anchor drags, menu navigation — via Playwright.
 *
 * `page`/`canvas` are attached ONLY when building the world for an e2eOnly
 * test; appTest fns must stay implementation-blind.
 */
import type { Page } from '@playwright/test';
import type FlowGraphEditor from '../../src/lib/FlowInterface/FlowGraphEditor';
import type { CanvasDriver } from './canvas';
import type {
  BoardDriver, CatalogDriver, ChartsDriver, ChatDriver, E2EWorld, Expect, TrainingDriver,
  WindowName, WindowsDriver, World,
} from './define';

// Dev-only debug handle main.ts installs (same local-typing pattern).
type NnvpDebugWindow = Window & { nnvp: { debug: { graphEditor: FlowGraphEditor } } };

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
      const box = (await page.locator(canvas.layer).nth(index).boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await settle();
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
    graphJSON: () => page.evaluate(() => (window as unknown as NnvpDebugWindow).nnvp.debug.graphEditor.toJSON()),
    async loadJSON(json) {
      await page.evaluate((raw) => {
        const editor = (window as unknown as NnvpDebugWindow).nnvp.debug.graphEditor;
        editor.model.loadJSON(raw);
        editor.updateGraph();
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
        window.dispatchEvent(new CustomEvent('nnvp:auth-changed'));
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
      await page.click('.layer-help-ask');
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

  const world: World & { page?: Page; canvas?: CanvasDriver } = {
    expect, board, chat, catalog, windows, charts, training, dispose: async () => {},
  };
  if (exposePage) {
    world.page = page;
    world.canvas = canvas;
  }
  return world;
}
