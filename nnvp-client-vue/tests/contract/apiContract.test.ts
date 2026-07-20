/**
 * apiContract.test.ts
 *
 * REAL round-trip contract tests: the SPA's actual ApiClient
 * (src/lib/Backend/apiClient.ts) talking to the actual Django Ninja backend
 * over real HTTP (Node's global fetch). No mocks anywhere — including auth:
 * the magic-link flow reads the actual emails the backend "sends" via
 * Django's file-based email backend (NNVP_MAIL_DIR, exported by the script).
 *
 * Requires a running backend, e.g. via `bash scripts/test-contract.sh`, or:
 *   NNVP_BACKEND_URL=http://127.0.0.1:8123 NNVP_MAIL_DIR=/tmp/nnvp-mail \
 *     bun run test:contract
 *
 * These tests are intentionally excluded from `bun run test:unit`
 * (the scripts scope bun test to tests/unit vs tests/contract).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'bun:test';
import ApiClient, { ApiError, ERROR_CODES } from '../../src/lib/Backend/apiClient';

const BACKEND_URL = process.env.NNVP_BACKEND_URL || 'http://127.0.0.1:8123';
const MAIL_DIR = process.env.NNVP_MAIL_DIR || '';

// ---------------------------------------------------------------------------
// Response shapes (what the backend contract returns, as these tests read it)
// ---------------------------------------------------------------------------

interface UserOut { id: number; email: string }

interface AuthStatusOut {
  verified: boolean;
  user: UserOut | null;
  code?: string | null;
}

interface ProjectOut {
  id: number;
  name: string;
  graph: unknown;
  updated_at: string;
  parent_id: number | null;
  tags: string[];
}

interface LineageOut {
  focus: number;
  nodes: Array<{ id: number }>;
  edges: Array<{ source: number; target: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory Storage stub (the client supports injectable storage). */
class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, String(value)); }
  removeItem(key: string): void { this.map.delete(key); }
}

function makeClient(): ApiClient {
  return new ApiClient({
    storage: new MemoryStorage(),
    baseUrl: `${BACKEND_URL}/api`,
  });
}

/**
 * The raw magic token from the ONE email sent since the last call. Django's
 * filebased backend writes one file per send, but its filenames only have
 * second-granularity timestamps (plus an arbitrary id) — sorting them can
 * misorder two sends within the same second. Consuming unseen files is
 * deterministic instead: every magic request produces exactly one new file.
 */
const seenMailFiles = new Set<string>();
function takeMagicToken(): string {
  if (!MAIL_DIR) {
    throw new Error('NNVP_MAIL_DIR is not set — run via `bash scripts/test-contract.sh`');
  }
  const unseen = readdirSync(MAIL_DIR).filter((f) => !seenMailFiles.has(f));
  if (unseen.length !== 1) {
    throw new Error(`expected exactly 1 new email in ${MAIL_DIR}, found ${unseen.length}`);
  }
  seenMailFiles.add(unseen[0]!);
  const body = readFileSync(join(MAIL_DIR, unseen[0]!), 'utf8');
  const match = body.match(/\?magic=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no magic link found in email:\n${body}`);
  return match[1]!;
}

/**
 * Full real-HTTP magic-link sign-in for `client`: request (client stores its
 * pending bearer), read the emailed link, approve it, confirm via status.
 */
async function signIn(client: ApiClient, email: string) {
  const requested = (await client.requestMagicLink(email))!;
  await client.approveMagicLink(takeMagicToken());
  const status = await client.authStatus() as AuthStatusOut;
  if (!status.verified) throw new Error('approval did not verify the requesting client');
  return { ...status, code: requested.code };
}

// Unique emails per run so re-runs against a reused DB never collide.
const RUN_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
let emailCounter = 0;
function uniqueEmail(): string {
  emailCounter += 1;
  return `contract-${RUN_ID}-${emailCounter}@example.test`;
}

/** Await a rejection and assert it is a structured ApiError. */
async function expectApiError(
  promise: Promise<unknown>,
  { code, status }: { code?: string; status?: number } = {},
): Promise<ApiError> {
  const err: unknown = await promise.then(
    (value) => {
      throw new Error(`expected ApiError but the call resolved with: ${JSON.stringify(value)}`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  const apiError = err as ApiError;
  expect(apiError.name).toBe('ApiError');
  if (code !== undefined) expect(apiError.code).toBe(code);
  if (status !== undefined) expect(apiError.status).toBe(status);
  return apiError;
}

/**
 * A REALISTIC graph payload in the exact `{layers, edges, inputs, outputs}`
 * shape the app saves (see D3Model.generateJson / AccountPanel cloud save).
 * Lifted from the repo's real MNIST CNN example; the file stores only
 * `{layers, edges}`, so `inputs`/`outputs` are derived from the Input/Output
 * layers, matching what D3Model serializes for a loaded model.
 */
function realisticGraph() {
  const file = fileURLToPath(
    new URL('../../../ourKerasExemples/Mnist_Cnn_Param.json', import.meta.url),
  );
  const { layers, edges } = JSON.parse(readFileSync(file, 'utf8')) as {
    layers: Array<{ id: number; kerasLayer: { name: string } }>;
    edges: unknown[];
  };
  return {
    layers,
    edges,
    inputs: layers.filter((l) => l.kerasLayer.name === 'Input').map((l) => l.id),
    outputs: layers.filter((l) => l.kerasLayer.name === 'Output').map((l) => l.id),
  };
}

/** A small hand-built graph in the same shape, used for update round-trips. */
function smallGraph() {
  return {
    layers: [
      { class: 'D3Layer', x: 10, y: 10, width: 80, height: 40, id: 0, htmlID: 'Layer_0', name: 'Input', inputLayers: [], outputLayers: [1], kerasLayer: { name: 'Input' } },
      { class: 'D3Layer', x: 10, y: 90, width: 80, height: 40, id: 1, htmlID: 'Layer_1', name: 'Dense', inputLayers: [0], outputLayers: [2], kerasLayer: { name: 'Dense', parameterValues: { units: 4, activation: 'relu' } } },
      { class: 'D3Layer', x: 10, y: 170, width: 80, height: 40, id: 2, htmlID: 'Layer_2', name: 'Output', inputLayers: [1], outputLayers: [], kerasLayer: { name: 'Output' } },
    ],
    edges: [
      { id: 's0_t1', source: 0, target: 1 },
      { id: 's1_t2', source: 1, target: 2 },
    ],
    inputs: [0],
    outputs: [2],
  };
}

// ---------------------------------------------------------------------------
// Suite (single file, sequential: later blocks reuse state from earlier ones)
// ---------------------------------------------------------------------------

describe(`API contract against real backend at ${BACKEND_URL}`, () => {
  beforeAll(async () => {
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/docs`);
    } catch (cause) {
      throw new Error(
        `No backend reachable at ${BACKEND_URL} (${cause}). `
        + 'Start one with `bash scripts/test-contract.sh` or set NNVP_BACKEND_URL.',
      );
    }
    expect(response.ok).toBe(true);
  });

  // Shared state across the ordered tests below.
  const alice: { client: ApiClient; email: string; id?: number } = {
    client: makeClient(), email: uniqueEmail(),
  };
  const bob: { client: ApiClient; email: string; id?: number } = {
    client: makeClient(), email: uniqueEmail(),
  };
  const graph = realisticGraph();
  let aliceProjectId: number | null = null;

  describe('auth (magic link)', () => {
    it('first login: pending bearer + code, approve verifies THE REQUESTING client', async () => {
      const requested = (await alice.client.requestMagicLink(alice.email))!;
      expect(typeof requested.token).toBe('string');
      expect(requested.code).toMatch(/^[2-9A-HJKMNP-Z]{4}$/);
      // The pending bearer is stored but useless until approved.
      expect(alice.client.getToken()).toBe(requested.token);
      await expectApiError(alice.client.me(), { code: ERROR_CODES.http, status: 401 });
      const pending = await alice.client.authStatus();
      expect(pending).toEqual({ verified: false, user: null, code: requested.code });

      // The approval side gets a confirmation, never a credential.
      const approved = await alice.client.approveMagicLink(takeMagicToken()) as UserOut;
      expect(approved.email).toBe(alice.email);
      alice.id = approved.id;

      // The SAME stored bearer is now a full session.
      const status = await alice.client.authStatus() as AuthStatusOut;
      expect(status.verified).toBe(true);
      expect(status.user).toEqual({ id: alice.id, email: alice.email });
      expect(alice.client.getToken()).toBe(requested.token);
    });

    it('info reports the match code and detects the requesting browser', async () => {
      const client = makeClient();
      const { code } = (await client.requestMagicLink(alice.email))!;
      const raw = takeMagicToken();
      const sameInfo = await client.magicInfo(raw) as {
        code: string; requester: string; same_browser: boolean;
      }; // sends its own pending bearer
      expect(sameInfo.code).toBe(code);
      expect(sameInfo.same_browser).toBe(true);
      expect(typeof sameInfo.requester).toBe('string');
      const strangerInfo = await makeClient().magicInfo(raw) as { same_browser: boolean }; // no credentials
      expect(strangerInfo.same_browser).toBe(false);
      await client.approveMagicLink(raw); // clean up: finish this login
      await client.logout();
    });

    it('a magic link is single-use: approving it again is a structured 401', async () => {
      const client = makeClient();
      await client.requestMagicLink(alice.email);
      const raw = takeMagicToken();
      await client.approveMagicLink(raw);

      const err = await expectApiError(
        makeClient().approveMagicLink(raw),
        { code: ERROR_CODES.http, status: 401 },
      );
      expect(err.body).toEqual({ detail: 'Invalid or expired sign-in link.' });
      expect(err.message).toBe('Invalid or expired sign-in link.');
      await client.logout();
    });

    it('a second login reuses the account and issues a fresh token', async () => {
      const client = makeClient();
      const status = await signIn(client, alice.email);
      expect(status.user).toEqual({ id: alice.id, email: alice.email });

      // Keep alice on this fresh token for the rest of the suite.
      alice.client = client;
    });

    it('me returns the id/email of the token owner', async () => {
      const me = await alice.client.me();
      expect(me).toEqual({ id: alice.id, email: alice.email });
    });

    it('logout cancels a pending login: the emailed link stops working', async () => {
      const client = makeClient();
      await client.requestMagicLink(alice.email);
      const raw = takeMagicToken();
      await client.logout(); // revokes the pending bearer server-side
      await expectApiError(
        makeClient().approveMagicLink(raw),
        { code: ERROR_CODES.http, status: 401 },
      );
    });

    it('a garbage link token fails with a structured 401 ApiError', async () => {
      await expectApiError(
        makeClient().approveMagicLink('definitely-not-a-real-token'),
        { code: ERROR_CODES.http, status: 401 },
      );
    });

    it('a malformed email is rejected with 422 and sends nothing', async () => {
      await expectApiError(
        makeClient().requestMagicLink('not-an-email'),
        { code: ERROR_CODES.http, status: 422 },
      );
    });

    it('me with no token short-circuits client-side with a not-logged-in ApiError', async () => {
      const client = makeClient(); // configured URL, no token
      const err = await expectApiError(client.me(), { code: ERROR_CODES.notLoggedIn });
      expect(err.status).toBeNull(); // never hit the network
    });

    it('me with an invalid token is rejected by the backend with 401', async () => {
      const client = makeClient();
      client.setToken('not-a-real-token');
      const err = await expectApiError(client.me(), { code: ERROR_CODES.http, status: 401 });
      expect(err.body).toEqual({ detail: 'Unauthorized' });
    });

    it('project routes also require auth (401 with an invalid token)', async () => {
      const client = makeClient();
      client.setToken('not-a-real-token');
      await expectApiError(client.listProjects(), { code: ERROR_CODES.http, status: 401 });
    });
  });

  describe('projects CRUD round-trip', () => {
    it('create returns the full project including the graph exactly as sent', async () => {
      const created = await alice.client.createProject({ name: 'Mnist CNN', graph }) as ProjectOut;

      expect(typeof created.id).toBe('number');
      expect(created.name).toBe('Mnist CNN');
      expect(typeof created.updated_at).toBe('string');
      expect(Number.isNaN(Date.parse(created.updated_at))).toBe(false);
      // The true round-trip: the stored graph deep-equals what the app sent.
      expect(created.graph).toEqual(graph);

      aliceProjectId = created.id;
    });

    it('list includes the project WITHOUT the graph blob', async () => {
      const projects = await alice.client.listProjects() as ProjectOut[];
      expect(Array.isArray(projects)).toBe(true);

      const entry = projects.find((p) => p.id === aliceProjectId);
      expect(entry).toBeDefined();
      expect(entry!.name).toBe('Mnist CNN');
      expect(typeof entry!.updated_at).toBe('string');
      // Contract: the list payload omits the graph entirely.
      expect('graph' in entry!).toBe(false);
      expect(Object.keys(entry!).sort()).toEqual(['id', 'name', 'parent_id', 'tags', 'updated_at']);
    });

    it('get returns the graph, deep-equal to what was sent', async () => {
      const project = await alice.client.getProject(aliceProjectId!) as ProjectOut;
      expect(project.id).toBe(aliceProjectId);
      expect(project.name).toBe('Mnist CNN');
      expect(project.graph).toEqual(graph);
    });

    it('update with name only renames without touching the stored graph', async () => {
      const updated = await alice.client.updateProject(
        aliceProjectId!, { name: 'Mnist CNN v2' },
      ) as ProjectOut;
      expect(updated.id).toBe(aliceProjectId);
      expect(updated.name).toBe('Mnist CNN v2');
      expect(updated.graph).toEqual(graph);

      const refetched = await alice.client.getProject(aliceProjectId!) as ProjectOut;
      expect(refetched.name).toBe('Mnist CNN v2');
      expect(refetched.graph).toEqual(graph);
    });

    it('update with a new graph round-trips the new graph', async () => {
      const nextGraph = smallGraph();
      const updated = await alice.client.updateProject(aliceProjectId!, {
        name: 'Small Dense',
        graph: nextGraph,
      }) as ProjectOut;
      expect(updated.name).toBe('Small Dense');
      expect(updated.graph).toEqual(nextGraph);

      const refetched = await alice.client.getProject(aliceProjectId!) as ProjectOut;
      expect(refetched.graph).toEqual(nextGraph);
      expect(refetched.graph).not.toEqual(graph);
    });

    it('get of a nonexistent project id is a structured 404', async () => {
      await expectApiError(
        alice.client.getProject(99999999),
        { code: ERROR_CODES.http, status: 404 },
      );
    });
  });

  describe('lineage & tags', () => {
    it('saves-as-continuation build a chain the lineage endpoint windows to ±2', async () => {
      const mk = (name: string, parent?: number) => alice.client.createProject({
        name, graph: {}, tags: [name], parent,
      }) as Promise<ProjectOut>;
      const g2 = await mk('lineage-g2');
      const g1 = await mk('lineage-g1', g2.id);
      const focus = await mk('lineage-focus', g1.id);
      const c1 = await mk('lineage-c1', focus.id);
      const c2 = await mk('lineage-c2', c1.id);
      const c3 = await mk('lineage-c3', c2.id); // 3 below focus: outside the window

      expect(c1.parent_id).toBe(focus.id);
      expect(c1.tags).toEqual(['lineage-c1']);

      const lineage = await alice.client.projectLineage(focus.id) as LineageOut;
      expect(lineage.focus).toBe(focus.id);
      const ids = lineage.nodes.map(n => n.id).sort((a, b) => a - b);
      expect(ids).toEqual([g2.id, g1.id, focus.id, c1.id, c2.id].sort((a, b) => a - b));
      expect(ids).not.toContain(c3.id);
      expect(lineage.edges).toContainEqual({ source: focus.id, target: c1.id });
    });
  });

  describe('ownership isolation', () => {
    it('a second user cannot read, modify, or see the first user\'s project', async () => {
      const status = await signIn(bob.client, bob.email);
      expect(status.verified).toBe(true);

      // Read is a 404 (not a 403): existence is not leaked across owners.
      await expectApiError(
        bob.client.getProject(aliceProjectId!),
        { code: ERROR_CODES.http, status: 404 },
      );
      await expectApiError(
        bob.client.updateProject(aliceProjectId!, { name: 'hijacked' }),
        { code: ERROR_CODES.http, status: 404 },
      );
      await expectApiError(
        bob.client.deleteProject(aliceProjectId!),
        { code: ERROR_CODES.http, status: 404 },
      );

      // Bob's list does not contain Alice's project.
      const bobProjects = await bob.client.listProjects() as ProjectOut[];
      expect(bobProjects.some((p) => p.id === aliceProjectId)).toBe(false);

      // And Alice's project is untouched by the failed cross-user writes.
      const project = await alice.client.getProject(aliceProjectId!) as ProjectOut;
      expect(project.name).toBe('Small Dense');
    });
  });

  describe('delete', () => {
    it('delete returns 204 (client resolves null) and a subsequent get is 404', async () => {
      const result = await alice.client.deleteProject(aliceProjectId!);
      expect(result).toBeNull(); // 204 No Content

      await expectApiError(
        alice.client.getProject(aliceProjectId!),
        { code: ERROR_CODES.http, status: 404 },
      );

      const projects = await alice.client.listProjects() as ProjectOut[];
      expect(projects.some((p) => p.id === aliceProjectId)).toBe(false);
    });
  });
});
