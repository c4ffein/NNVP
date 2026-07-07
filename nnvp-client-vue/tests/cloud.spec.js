import { test, expect } from '@playwright/test';

// End-to-end for the optional cloud layer. The real Django Ninja backend is
// never involved: every `**/api/**` call is intercepted with page.route and
// answered from an in-memory fake, so this exercises the SPA's client + UI only.
test.describe('Cloud accounts & projects', () => {
  test('login -> save project -> see it listed -> open it', async ({ page }) => {
    // Point the app at a backend URL before any script runs, so the panel
    // starts in the "sign in" state rather than "no backend configured".
    await page.addInitScript(() => {
      window.localStorage.setItem('nnvp_backend_url', 'http://localhost:8009');
    });

    // --- mock backend -------------------------------------------------------
    const state = { projects: [], nextId: 1, token: 'test-token' };
    const json = (route, status, body) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const { pathname } = url;
      const method = req.method();
      const post = () => (req.postDataJSON ? req.postDataJSON() : JSON.parse(req.postData() || '{}'));

      if (pathname === '/api/auth/login' && method === 'POST') {
        return json(route, 200, { token: state.token, user: { id: 1, email: post().email } });
      }
      if (pathname === '/api/auth/me' && method === 'GET') {
        return json(route, 200, { id: 1, email: 'tester@example.com' });
      }
      if (pathname === '/api/projects' && method === 'GET') {
        return json(route, 200, state.projects.map(
          ({ id, name, updated_at }) => ({ id, name, updated_at }),
        ));
      }
      if (pathname === '/api/projects' && method === 'POST') {
        const body = post();
        const project = {
          id: state.nextId++,
          name: body.name,
          graph: body.graph,
          updated_at: new Date().toISOString(),
        };
        state.projects.push(project);
        return json(route, 201, project);
      }
      const match = pathname.match(/^\/api\/projects\/(\d+)$/);
      if (match) {
        const id = Number(match[1]);
        const project = state.projects.find(p => p.id === id);
        if (!project) return json(route, 404, { detail: 'Not found' });
        if (method === 'GET') return json(route, 200, project);
        if (method === 'DELETE') {
          state.projects = state.projects.filter(p => p.id !== id);
          return route.fulfill({ status: 204, body: '' });
        }
      }
      return json(route, 404, { detail: 'Unhandled' });
    });

    // Auto-accept the name prompt (save) and any confirm dialogs.
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'prompt') dialog.accept('Cloud Model');
      else dialog.accept();
    });

    await page.goto('/');
    await page.waitForTimeout(150);

    // --- build a board we can round-trip ------------------------------------
    await page.click('.LayerTemplate:has-text("Dense")');
    await page.waitForTimeout(50);
    await expect(page.locator('.d3Layer')).toHaveCount(1);

    // --- sign in ------------------------------------------------------------
    await page.click('#GeneralMenu .menuTitle:has-text("Account")');
    await expect(page.locator('#account-modal-title')).toBeVisible();

    await page.fill('input[type="email"]', 'tester@example.com');
    await page.fill('input[type="password"]', 'secret-pw');
    await page.click('button.btn-primary:has-text("Sign in")');

    // Signed-in view shows the projects section.
    await expect(page.locator('h2:has-text("My Projects")')).toBeVisible();

    // --- save the current board to the cloud --------------------------------
    await page.click('button:has-text("Save current")');
    await expect(page.locator('.project-name:has-text("Cloud Model")')).toBeVisible();

    // --- clear the board, then reopen the saved project ---------------------
    // Close the panel and wipe the board directly (skipPrompt) so we can prove
    // the reopen actually reloads the layer.
    await page.click('.modal-close');
    await page.evaluate(() => {
      window.d3Interface.activeGraph.clearBoard(true);
      window.d3Interface.activeGraph.updateGraph();
    });
    await expect(page.locator('.d3Layer')).toHaveCount(0);

    await page.click('#GeneralMenu .menuTitle:has-text("Account")');
    await expect(page.locator('.project-name:has-text("Cloud Model")')).toBeVisible();
    await page.click('.project-open:has-text("Cloud Model")');

    // Opening a project loads its graph back onto the board (UI updates).
    await expect(page.locator('.d3Layer')).toHaveCount(1);

    await page.screenshot({ path: '/tmp/h1-cloud.png', fullPage: true });
  });
});
