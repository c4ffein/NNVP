/**
 * Migrated from tests/saveload.spec.js. File > Load / Save open the
 * cloud-aware modal (backend mocked with page.route). Device-file paths and
 * the signed-out pitch are covered too. Both tests drive the modal as UI
 * with page.route / addInitScript, so they are e2eOnly mechanical wraps.
 */
import { e2eOnly } from '../harness/define';

e2eOnly(
  'saveload: signed out: both modals lead with the device option and pitch the cloud',
  'Walks the Save/Load modal chrome while signed out — device-first buttons, the cloud pitch heading, and the hand-off to the account modal — all rendered modal UI only a browser shows.',
  async ({ page, expect }) => {
    await page.click('text=File');
    await page.click('text=Save');
    await expect(page.locator('#saveload-title')).toHaveText('Save model');
    await expect(page.locator('button:has-text("Save to this device")')).toBeVisible();
    await expect(page.locator('h2:has-text("Or use the cloud")')).toBeVisible();

    // "Sign in" hands over to the account panel.
    await page.click('.saveload-container button:has-text("Sign in")');
    await expect(page.locator('#saveload-title')).toHaveCount(0);
    await expect(page.locator('#account-modal-title')).toBeVisible();
    await page.click('.modal-close');

    await page.click('text=File');
    await page.click('#GeneralMenu .dropdown-item-content:text-is("Load")');
    await expect(page.locator('#saveload-title')).toHaveText('Load model');
    await expect(page.locator('button:has-text("Load from this device")')).toBeVisible();
  },
);

e2eOnly(
  'saveload: signed in: save records lineage, load lists/searches and shows the local graph',
  'page.route-mocked backend plus addInitScript-seeded localStorage session, then drives the full modal UI: cloud save with lineage hint, project list/search rows, the rendered lineage graph, and open-selected updating localStorage — interception, init scripts and storage are browser-only.',
  async ({ page, canvas, expect }) => {
    // --- mock backend: verified session + a small saved-model family --------
    const state = {
      projects: [
        { id: 1, name: 'root', tags: ['mnist'], parent_id: null, updated_at: '2026-07-10T10:00:00Z', graph: {} },
        { id: 2, name: 'child', tags: ['cnn'], parent_id: 1, updated_at: '2026-07-11T10:00:00Z', graph: {} },
        { id: 3, name: 'other', tags: [], parent_id: null, updated_at: '2026-07-12T10:00:00Z', graph: {} },
      ],
      nextId: 4,
      created: [],
    };
    const json = (route, status, body) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    });
    await page.addInitScript(() => {
      window.localStorage.setItem('nnvp_backend_token', 'verified-token');
      window.localStorage.setItem('nnvp_current_project', JSON.stringify({ id: 2, name: 'child' }));
    });
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const { pathname } = new URL(req.url());
      const method = req.method();
      const post = () => (req.postDataJSON ? req.postDataJSON() : JSON.parse(req.postData() || '{}'));
      if (pathname === '/api/auth/status') {
        return json(route, 200, { verified: true, user: { id: 1, email: 't@x.com' } });
      }
      if (pathname === '/api/auth/me') return json(route, 200, { id: 1, email: 't@x.com' });
      if (pathname === '/api/projects' && method === 'GET') {
        return json(route, 200, state.projects.map(({ graph: _graph, ...rest }) => rest));
      }
      if (pathname === '/api/projects' && method === 'POST') {
        const body = post();
        const project = {
          id: state.nextId++,
          name: body.name,
          tags: body.tags || [],
          parent_id: body.parent ?? null,
          updated_at: new Date().toISOString(),
          graph: body.graph,
        };
        state.projects.push(project);
        state.created.push(body);
        return json(route, 201, project);
      }
      const lineage = pathname.match(/^\/api\/projects\/(\d+)\/lineage$/);
      if (lineage) {
        const focus = Number(lineage[1]);
        return json(route, 200, {
          focus,
          nodes: state.projects.map(({ graph: _graph, ...rest }) => rest),
          edges: state.projects.filter(p => p.parent_id !== null)
            .map(p => ({ source: p.parent_id, target: p.id })),
        });
      }
      const detail = pathname.match(/^\/api\/projects\/(\d+)$/);
      if (detail && method === 'GET') {
        const project = state.projects.find(p => p.id === Number(detail[1]));
        return project ? json(route, 200, project) : json(route, 404, { detail: 'Not found' });
      }
      return json(route, 404, { detail: 'Unhandled' });
    });

    // Reload so the init script (localStorage session) and route mocks apply
    // from app start — the runner's initial navigation predates them.
    await page.goto(canvas.home);
    await page.waitForTimeout(150);

    // --- SAVE: continuation of the tracked current project (#2) -------------
    await page.click('.LayerTemplate:has-text("Dense")');
    await page.waitForTimeout(50);
    await page.click('text=File');
    await page.click('#GeneralMenu .dropdown-item-content:text-is("Save")');
    await expect(page.locator('.saveload-content .hint')).toContainText('continuation of');
    await page.fill('.saveload-content input[type="text"] >> nth=0', 'grandchild');
    await page.fill('input[placeholder="mnist, cnn, experiment"]', 'v2, best');
    await page.click('button:has-text("Save to cloud")');
    await expect(page.locator('.msg-ok')).toContainText('Saved “grandchild”');
    expect(state.created[0].parent).toBe(2);
    expect(state.created[0].tags).toEqual(['v2', 'best']);
    await page.click('.modal-close');

    // --- LOAD: search narrows by tag; lineage graph renders; open loads -----
    await page.click('text=File');
    await page.click('#GeneralMenu .dropdown-item-content:text-is("Load")');
    await expect(page.locator('.project-row')).toHaveCount(4);
    await page.fill('.saveload-content input[type="search"]', 'mnist');
    await expect(page.locator('.project-row')).toHaveCount(1);
    await page.fill('.saveload-content input[type="search"]', '');
    await page.click('.project-row:has-text("child") >> nth=0');
    await expect(page.locator('[data-testid="lineage-graph"]')).toBeVisible();
    // 4 saved models, all connected through root/child: all in the window.
    await expect(page.locator('.lineage-node')).toHaveCount(3);

    await page.click('button:has-text("Open selected")');
    await expect(page.locator('#saveload-title')).toHaveCount(0);
    // The opened project became the new continuation anchor.
    const current = await page.evaluate(() => JSON.parse(window.localStorage.getItem('nnvp_current_project')));
    expect(current.id).toBe(2);
  },
);
