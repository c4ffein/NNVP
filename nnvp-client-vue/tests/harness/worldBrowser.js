/**
 * The BROWSER world for dual-mode tests (see tests/harness/define.js): the same
 * helper surface as worldBun.js, implemented as real UI interaction —
 * catalog clicks, anchor drags, menu navigation — via Playwright.
 *
 * `page`/`canvas` are attached ONLY when building the world for an e2eOnly
 * test; appTest fns must stay implementation-blind.
 */
export function makeBrowserWorld(page, canvas, expect, { exposePage = false } = {}) {
  const settle = () => page.waitForTimeout(60);

  const openMenu = async (title) => {
    await page.click(`#GeneralMenu .menuTitle:has-text("${title}")`);
    await page.waitForTimeout(40);
  };

  const board = {
    async addLayer(name) {
      await page.click(`.LayerTemplate:has(.layer-template-name:text-is("${name}"))`);
      // Catalog drops land stacked (15px stagger); spread each new layer to a
      // deterministic grid slot so later anchor drags never fight overlap.
      await page.evaluate(() => {
        const editor = window.nnvp.debug.graphEditor;
        const nodes = editor.store.getNodes();
        const index = nodes.length - 1;
        editor.moveLayerTo(nodes[index].id, 80 + (index % 3) * 220, 60 + Math.floor(index / 3) * 140);
      });
      await settle();
    },
    async connect(sourceIndex, targetIndex) {
      await canvas.connect(page, sourceIndex, targetIndex);
      await settle();
    },
    async select(index) {
      const box = await page.locator(canvas.layer).nth(index).boundingBox();
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
    graphJSON: () => page.evaluate(() => window.nnvp.debug.graphEditor.toJSON()),
    async loadJSON(json) {
      await page.evaluate((raw) => {
        const editor = window.nnvp.debug.graphEditor;
        editor.model.loadJSON(raw);
        editor.updateGraph();
      }, json);
      await settle();
    },
  };

  // Same contract as worldComponents.makeCatalogDriver, on the real catalog.
  const catalog = {
    async open() {}, // always mounted in the app
    async toggleAll() {
      await page.click('.collapse-all-button');
    },
    async toggleCategory(name) {
      await page.click(`[aria-label="Toggle ${name} layers"]`);
    },
    async masterArrowCollapsed() {
      const classes = await page.locator('.collapse-all-arrow').getAttribute('class');
      return classes.split(/\s+/).includes('collapsed');
    },
  };

  // Same contract as worldComponents.makeChatDriver, expressed as real UI.
  const chat = {
    async setSignedIn(signedIn) {
      await page.evaluate((on) => {
        if (on) window.localStorage.setItem('nnvp_backend_token', 'test-token');
        else window.localStorage.removeItem('nnvp_backend_token');
        window.dispatchEvent(new CustomEvent('nnvp:auth-changed'));
      }, signedIn);
    },
    async open() {
      await page.click('.chat-fab');
      await settle();
    },
    async connectPromptVisible() {
      return (await page.locator('.chat-connect').count()) > 0;
    },
    async inputEnabled() {
      const input = page.locator('.chat-input');
      if ((await input.count()) === 0) return false;
      return input.isEnabled();
    },
    async settingsAsksForApiKey() {
      await page.click('#chat-panel [aria-label="Settings"]');
      await settle();
      const text = await page.locator('.chat-settings').textContent();
      const hasKeyField = (await page.locator('.chat-settings input[type="password"]').count()) > 0;
      return /api key/i.test(text || '') && hasKeyField;
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
  };

  const world = {
    expect, board, chat, catalog, dispose: async () => {},
  };
  if (exposePage) {
    world.page = page;
    world.canvas = canvas;
  }
  return world;
}
