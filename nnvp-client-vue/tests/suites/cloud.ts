/**
 * Migrated from tests/cloud.spec.js. End-to-end for the optional cloud layer.
 * The real Django Ninja backend is never involved: every same-origin
 * `/api/**` call is intercepted with page.route and answered from an
 * in-memory fake, so this exercises the SPA's client + UI only — including
 * the whole magic-link dance: request a link (pending bearer + match code,
 * polling starts), then land on /?magic=<token> as the emailed link would and
 * click the deliberate Approve button. page.route interception is
 * browser-runner-only, so every test is an e2eOnly mechanical wrap.
 */
import type { Route } from '@playwright/test';
import { e2eOnly } from '../harness/define';

/** What the SPA can POST at the fake backend (parsed request bodies). */
interface PostBody {
  email?: string;
  token?: string;
  name?: string;
  graph?: unknown;
}

interface FakeProject {
  id: number;
  name: string;
  graph: unknown;
  updated_at: string;
}

e2eOnly(
  'cloud: magic-link login (same browser) -> save project -> reopen it',
  'Mocks the backend with page.route and walks the account-modal UI end to end: magic-link request, /?magic= navigation, deliberate approve click, project save through a window prompt dialog, and a board round-trip — HTTP interception, navigation and dialogs are browser-only.',
  async ({ page, canvas, expect }) => {
    // --- mock backend -------------------------------------------------------
    const state = {
      projects: [] as FakeProject[],
      nextId: 1,
      bearer: 'pending-bearer-1',
      verified: false,
      requests: [] as Array<string | undefined>,
    };
    const json = (route: Route, status: number, body: unknown) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    const USER = { id: 1, email: 'tester@example.com' };

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const { pathname } = new URL(req.url());
      const method = req.method();
      const post = (): PostBody => (req.postDataJSON
        ? req.postDataJSON()
        : JSON.parse(req.postData() || '{}')) as PostBody;
      const bearerOf = () => (req.headers().authorization || '').replace('Bearer ', '');

      if (pathname === '/api/auth/magic/request' && method === 'POST') {
        state.requests.push(post().email);
        return json(route, 200, { token: state.bearer, code: '7K3Q' });
      }
      if (pathname === '/api/auth/status' && method === 'GET') {
        if (bearerOf() !== state.bearer) return json(route, 401, { detail: 'Unauthorized' });
        return json(route, 200, state.verified
          ? { verified: true, user: USER }
          : { verified: false, code: '7K3Q' });
      }
      if (pathname === '/api/auth/magic/info' && method === 'POST') {
        if (post().token !== 'magic-link-1') return json(route, 401, { detail: 'Invalid or expired sign-in link.' });
        return json(route, 200, {
          code: '7K3Q',
          requester: 'Chromium on Linux',
          requested_at: new Date().toISOString(),
          same_browser: bearerOf() === state.bearer,
        });
      }
      if (pathname === '/api/auth/magic/approve' && method === 'POST') {
        if (post().token !== 'magic-link-1' || state.verified) {
          return json(route, 401, { detail: 'Invalid or expired sign-in link.' });
        }
        state.verified = true; // single-use
        return json(route, 200, USER);
      }
      if (pathname === '/api/auth/me' && method === 'GET') {
        if (bearerOf() !== state.bearer || !state.verified) return json(route, 401, { detail: 'Unauthorized' });
        return json(route, 200, USER);
      }
      if (pathname === '/api/projects' && method === 'GET') {
        return json(route, 200, state.projects.map(
          ({ id, name, updated_at }) => ({ id, name, updated_at }),
        ));
      }
      if (pathname === '/api/projects' && method === 'POST') {
        const body = post();
        const project: FakeProject = {
          id: state.nextId++,
          name: body.name!,
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

    // The runner installed a generic accept-all dialog handler; replace it so
    // the save prompt is answered with the project name (a second handler
    // would double-handle and throw).
    page.removeAllListeners('dialog');
    // Auto-accept the name prompt (save) and any confirm dialogs.
    page.on('dialog', (dialog) => {
      if (dialog.type() === 'prompt') dialog.accept('Cloud Model');
      else dialog.accept();
    });

    // Reload so every /api call from app start goes through the mock.
    await page.goto(canvas.home);
    await page.waitForTimeout(150);

    // --- request a sign-in link: waiting state shows the match code ---------
    await page.click('#generalMenu .account-btn');
    await expect(page.locator('#account-modal-title')).toBeVisible();

    await page.fill('input[type="email"]', 'tester@example.com');
    await page.click('button.btn-primary:has-text("Email me a sign-in link")');
    await expect(page.locator('[data-testid="match-code"]')).toHaveText('7K3Q');
    expect(state.requests).toEqual(['tester@example.com']);

    // --- follow the emailed link (same browser: it holds the pending bearer).
    // The approval page must say so, show the code, and require a deliberate
    // click; approving verifies OUR stored token and signs this panel in.
    await page.goto('/?magic=magic-link-1');
    await expect(page.locator('#account-modal-title')).toBeVisible();
    await expect(page.locator('h2:has-text("Approve sign-in")')).toBeVisible();
    await expect(page.locator('.sign-in-hint')).toContainText('this browser');
    expect(new URL(page.url()).searchParams.get('magic')).toBeNull(); // stripped
    await page.click('button:has-text("Approve sign-in")');

    await expect(page.locator('h2:has-text("My Projects")')).toBeVisible();
    await expect(page.locator('.user-email')).toHaveText('tester@example.com');

    // --- build a board we can round-trip ------------------------------------
    await page.click('.modal-close');
    await page.click('.LayerTemplate:has-text("Dense")');
    await page.waitForTimeout(50);
    await expect(page.locator(canvas.layer)).toHaveCount(1);

    // --- save the current board to the cloud --------------------------------
    await page.click('#generalMenu .account-btn');
    await expect(page.locator('h2:has-text("My Projects")')).toBeVisible();
    await page.click('button:has-text("Save current")');
    await expect(page.locator('.project-name:has-text("Cloud Model")')).toBeVisible();

    // --- clear the board, then reopen the saved project ---------------------
    await page.click('.modal-close');
    await page.evaluate(() => {
      const win = window as unknown as {
        boardInterface: {
          activeGraph: { clearBoard(full: boolean): void; updateGraph(): void };
        };
      };
      win.boardInterface.activeGraph.clearBoard(true);
      win.boardInterface.activeGraph.updateGraph();
    });
    await expect(page.locator(canvas.layer)).toHaveCount(0);

    await page.click('#generalMenu .account-btn');
    await expect(page.locator('.project-name:has-text("Cloud Model")')).toBeVisible();
    await page.click('.project-open:has-text("Cloud Model")');

    // Opening a project loads its graph back onto the board (UI updates).
    await expect(page.locator(canvas.layer)).toHaveCount(1);
  },
);

e2eOnly(
  'cloud: cross-device approval: the clicking browser approves but stays signed out',
  'page.route-mocked approval flow on a bearer-less browser (like a phone opening the email): asserts the rendered hint UI, that approve fired, no projects view appears, and localStorage holds no token — interception, navigation and storage are browser-only.',
  async ({ page, expect }) => {
    // This browser holds NO pending bearer, like a phone opening the email.
    let approved = false;
    await page.route('**/api/auth/magic/info', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'X9PM',
        requester: 'Firefox on Linux',
        requested_at: new Date().toISOString(),
        same_browser: false,
      }),
    }));
    await page.route('**/api/auth/magic/approve', (route) => {
      approved = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 2, email: 'other@example.com' }),
      });
    });

    await page.goto('/?magic=someone-elses-link');
    await expect(page.locator('h2:has-text("Approve sign-in")')).toBeVisible();
    await expect(page.locator('.sign-in-hint')).toContainText('X9PM');
    await expect(page.locator('.sign-in-hint')).toContainText('Firefox on Linux');
    await page.click('button:has-text("Approve sign-in")');

    // Confirmation only: no session on this browser, no projects view.
    await expect(page.locator('.sign-in-hint')).toContainText('You can close this tab');
    expect(approved).toBe(true);
    await expect(page.locator('h2:has-text("My Projects")')).not.toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem('nnvp_backend_token'));
    expect(token).toBeNull();
  },
);

e2eOnly(
  'cloud: a pending login blocks the app across refreshes; closing the modal cancels it',
  'Exercises real page.reload cycles against a page.route-mocked pending session: the forced modal must survive refreshes, and closing it must revoke server-side and clear localStorage — reloads, interception and storage need a browser.',
  async ({ page, canvas, expect }) => {
    const state = { revoked: false };
    const json = (route: Route, status: number, body: unknown) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    await page.route('**/api/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/api/auth/magic/request') {
        return json(route, 200, { token: 'pending-bearer-2', code: 'ZX2M' });
      }
      if (pathname === '/api/auth/status') {
        if (state.revoked) return json(route, 401, { detail: 'Unauthorized' });
        return json(route, 200, { verified: false, code: 'ZX2M' });
      }
      if (pathname === '/api/auth/logout') {
        state.revoked = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return json(route, 404, { detail: 'Unhandled' });
    });

    // Reload so every /api call from app start goes through the mock.
    await page.goto(canvas.home);
    await page.click('#generalMenu .account-btn');
    await page.fill('input[type="email"]', 'tester@example.com');
    await page.click('button.btn-primary:has-text("Email me a sign-in link")');
    await expect(page.locator('[data-testid="match-code"]')).toHaveText('ZX2M');

    // Refresh: the pending token forces the waiting modal back open, with the
    // match code recovered from the status poll.
    await page.reload();
    await expect(page.locator('#account-modal-title')).toBeVisible();
    await expect(page.locator('[data-testid="match-code"]')).toHaveText('ZX2M');

    // Closing the modal CANCELS: server-side revocation + local token gone,
    // and the app is usable (no forced modal) after another refresh.
    await page.click('.modal-close');
    await expect(page.locator('#account-modal-title')).not.toBeVisible();
    expect(state.revoked).toBe(true);
    expect(await page.evaluate(() => window.localStorage.getItem('nnvp_backend_token'))).toBeNull();
    await page.reload();
    await page.waitForSelector('.vue-flow__pane');
    await expect(page.locator('#account-modal-title')).not.toBeVisible();
  },
);

e2eOnly(
  'cloud: an invalid magic link shows an error and stays signed out',
  'Navigates to /?magic= with a page.route-mocked 401 and asserts the rendered error message, the sign-in view, and the stripped URL parameter — interception and real URL handling are browser-only.',
  async ({ page, expect }) => {
    await page.route('**/api/auth/magic/info', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid or expired sign-in link.' }),
    }));

    await page.goto('/?magic=burnt-token');
    await expect(page.locator('#account-modal-title')).toBeVisible();
    await expect(page.locator('.msg-error')).toContainText('invalid or has expired');
    await expect(page.locator('h2:has-text("Sign in")')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('magic')).toBeNull();
  },
);
