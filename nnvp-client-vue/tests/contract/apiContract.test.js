/**
 * apiContract.test.js
 *
 * REAL round-trip contract tests: the SPA's actual ApiClient
 * (src/lib/Backend/apiClient.js) talking to the actual Django Ninja backend
 * over real HTTP (Node's global fetch). No mocks anywhere.
 *
 * Requires a running backend, e.g. via `bash scripts/test-contract.sh`, or:
 *   NNVP_BACKEND_URL=http://127.0.0.1:8123 bun run test:contract
 *
 * These tests are intentionally excluded from `bun run test:unit`
 * (the scripts scope bun test to tests/unit vs tests/contract).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'bun:test';
import ApiClient, { ApiError, ERROR_CODES } from '../../src/lib/Backend/apiClient.js';

const BACKEND_URL = process.env.NNVP_BACKEND_URL || 'http://127.0.0.1:8123';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory Storage stub (the client supports injectable storage). */
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function makeClient() {
  const client = new ApiClient({ storage: new MemoryStorage() });
  client.setBaseUrl(BACKEND_URL);
  return client;
}

// Unique emails per run so re-runs against a reused DB never collide.
const RUN_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
let emailCounter = 0;
function uniqueEmail() {
  emailCounter += 1;
  return `contract-${RUN_ID}-${emailCounter}@example.test`;
}

/** Await a rejection and assert it is a structured ApiError. */
async function expectApiError(promise, { code, status } = {}) {
  const err = await promise.then(
    (value) => {
      throw new Error(`expected ApiError but the call resolved with: ${JSON.stringify(value)}`);
    },
    (e) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err.name).toBe('ApiError');
  if (code !== undefined) expect(err.code).toBe(code);
  if (status !== undefined) expect(err.status).toBe(status);
  return err;
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
  const { layers, edges } = JSON.parse(readFileSync(file, 'utf8'));
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
    let response;
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
  const alice = { client: makeClient(), email: uniqueEmail(), password: `pw-${RUN_ID}-alice` };
  const bob = { client: makeClient(), email: uniqueEmail(), password: `pw-${RUN_ID}-bob` };
  const graph = realisticGraph();
  let aliceProjectId = null;

  describe('auth', () => {
    it('register returns 201 with a token and the user shape, and stores the token', async () => {
      const data = await alice.client.register({ email: alice.email, password: alice.password });

      expect(typeof data.token).toBe('string');
      expect(data.token.length).toBeGreaterThan(0);
      expect(typeof data.user.id).toBe('number');
      expect(data.user.email).toBe(alice.email);
      alice.id = data.user.id;

      // The client auto-stores the token in its (injected) storage.
      expect(alice.client.getToken()).toBe(data.token);
      expect(alice.client.isLoggedIn()).toBe(true);
    });

    it('registering the same email again is rejected with HTTP 409', async () => {
      const err = await expectApiError(
        makeClient().register({ email: alice.email, password: alice.password }),
        { code: ERROR_CODES.http, status: 409 },
      );
      expect(err.body).toEqual({ detail: 'A user with that email already exists.' });
    });

    it('login returns a fresh token for an existing user', async () => {
      const client = makeClient();
      const data = await client.login({ email: alice.email, password: alice.password });

      expect(typeof data.token).toBe('string');
      expect(data.token.length).toBeGreaterThan(0);
      expect(data.user).toEqual({ id: alice.id, email: alice.email });
      expect(client.getToken()).toBe(data.token);

      // Keep alice on a login-issued token for the rest of the suite.
      alice.client = client;
    });

    it('me returns the id/email of the token owner', async () => {
      const me = await alice.client.me();
      expect(me).toEqual({ id: alice.id, email: alice.email });
    });

    it('login with bad credentials fails with a structured 401 ApiError', async () => {
      const err = await expectApiError(
        makeClient().login({ email: alice.email, password: 'definitely-wrong' }),
        { code: ERROR_CODES.http, status: 401 },
      );
      expect(err.body).toEqual({ detail: 'Invalid email or password.' });
      expect(err.message).toBe('Invalid email or password.');
    });

    it('me with no token short-circuits client-side with a not-logged-in ApiError', async () => {
      const client = makeClient(); // configured URL, no token
      const err = await expectApiError(client.me(), { code: ERROR_CODES.notLoggedIn });
      expect(err.status).toBeNull(); // never hit the network
    });

    it('me with an invalid token is rejected by the backend with 401', async () => {
      const client = makeClient();
      client.setToken('not-a-real-jwt');
      const err = await expectApiError(client.me(), { code: ERROR_CODES.http, status: 401 });
      expect(err.body).toEqual({ detail: 'Unauthorized' });
    });

    it('project routes also require auth (401 with an invalid token)', async () => {
      const client = makeClient();
      client.setToken('not-a-real-jwt');
      await expectApiError(client.listProjects(), { code: ERROR_CODES.http, status: 401 });
    });
  });

  describe('projects CRUD round-trip', () => {
    it('create returns the full project including the graph exactly as sent', async () => {
      const created = await alice.client.createProject({ name: 'Mnist CNN', graph });

      expect(typeof created.id).toBe('number');
      expect(created.name).toBe('Mnist CNN');
      expect(typeof created.updated_at).toBe('string');
      expect(Number.isNaN(Date.parse(created.updated_at))).toBe(false);
      // The true round-trip: the stored graph deep-equals what the app sent.
      expect(created.graph).toEqual(graph);

      aliceProjectId = created.id;
    });

    it('list includes the project WITHOUT the graph blob', async () => {
      const projects = await alice.client.listProjects();
      expect(Array.isArray(projects)).toBe(true);

      const entry = projects.find((p) => p.id === aliceProjectId);
      expect(entry).toBeDefined();
      expect(entry.name).toBe('Mnist CNN');
      expect(typeof entry.updated_at).toBe('string');
      // Contract: the list payload omits the graph entirely.
      expect('graph' in entry).toBe(false);
      expect(Object.keys(entry).sort()).toEqual(['id', 'name', 'updated_at']);
    });

    it('get returns the graph, deep-equal to what was sent', async () => {
      const project = await alice.client.getProject(aliceProjectId);
      expect(project.id).toBe(aliceProjectId);
      expect(project.name).toBe('Mnist CNN');
      expect(project.graph).toEqual(graph);
    });

    it('update with name only renames without touching the stored graph', async () => {
      const updated = await alice.client.updateProject(aliceProjectId, { name: 'Mnist CNN v2' });
      expect(updated.id).toBe(aliceProjectId);
      expect(updated.name).toBe('Mnist CNN v2');
      expect(updated.graph).toEqual(graph);

      const refetched = await alice.client.getProject(aliceProjectId);
      expect(refetched.name).toBe('Mnist CNN v2');
      expect(refetched.graph).toEqual(graph);
    });

    it('update with a new graph round-trips the new graph', async () => {
      const nextGraph = smallGraph();
      const updated = await alice.client.updateProject(aliceProjectId, {
        name: 'Small Dense',
        graph: nextGraph,
      });
      expect(updated.name).toBe('Small Dense');
      expect(updated.graph).toEqual(nextGraph);

      const refetched = await alice.client.getProject(aliceProjectId);
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

  describe('ownership isolation', () => {
    it('a second user cannot read, modify, or see the first user\'s project', async () => {
      const data = await bob.client.register({ email: bob.email, password: bob.password });
      expect(typeof data.token).toBe('string');

      // Read is a 404 (not a 403): existence is not leaked across owners.
      await expectApiError(
        bob.client.getProject(aliceProjectId),
        { code: ERROR_CODES.http, status: 404 },
      );
      await expectApiError(
        bob.client.updateProject(aliceProjectId, { name: 'hijacked' }),
        { code: ERROR_CODES.http, status: 404 },
      );
      await expectApiError(
        bob.client.deleteProject(aliceProjectId),
        { code: ERROR_CODES.http, status: 404 },
      );

      // Bob's list does not contain Alice's project.
      const bobProjects = await bob.client.listProjects();
      expect(bobProjects.some((p) => p.id === aliceProjectId)).toBe(false);

      // And Alice's project is untouched by the failed cross-user writes.
      const project = await alice.client.getProject(aliceProjectId);
      expect(project.name).toBe('Small Dense');
    });
  });

  describe('delete', () => {
    it('delete returns 204 (client resolves null) and a subsequent get is 404', async () => {
      const result = await alice.client.deleteProject(aliceProjectId);
      expect(result).toBeNull(); // 204 No Content

      await expectApiError(
        alice.client.getProject(aliceProjectId),
        { code: ERROR_CODES.http, status: 404 },
      );

      const projects = await alice.client.listProjects();
      expect(projects.some((p) => p.id === aliceProjectId)).toBe(false);
    });
  });
});
