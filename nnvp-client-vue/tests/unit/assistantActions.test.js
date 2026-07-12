import { describe, it, expect, beforeEach } from 'bun:test';
import AssistantActions from '../../src/lib/Assistant/assistantActions';
import AnthropicClient, {
  buildTools,
  isMutatingTool,
  isPlausibleApiKey,
  readStoredConfig,
  usesBackendProxy,
  DEFAULT_BASE_URL,
  MUTATING_TOOLS,
} from '../../src/lib/Assistant/anthropicClient';

// A fake fetch returning a canned Anthropic-style response. `queue` is a list of
// { ok, status, json, text, throwErr } descriptors consumed one per call, so a
// test can script a whole tool-use loop (or an error) turn by turn.
function makeFakeFetch(queue) {
  const calls = [];
  const impl = (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    const next = queue.shift();
    if (!next) throw new Error('fake fetch: no more queued responses');
    if (next.throwErr) return Promise.reject(next.throwErr);
    return Promise.resolve({
      ok: next.ok !== undefined ? next.ok : true,
      status: next.status || 200,
      json: () => (next.jsonThrows
        ? Promise.reject(new Error('bad json'))
        : Promise.resolve(next.json)),
      text: () => Promise.resolve(next.text !== undefined ? next.text : ''),
    });
  };
  impl.calls = calls;
  return impl;
}

// Shorthand for a normal assistant reply containing a single text block.
function textReply(text) {
  return { json: { content: [{ type: 'text', text }] } };
}

// Shorthand for an assistant reply that calls one tool.
function toolReply(id, name, input) {
  return { json: { content: [{ type: 'tool_use', id, name, input }] } };
}

// --- Fakes ------------------------------------------------------------------
// A minimal stand-in for a KerasLayer: name + parameterValues + setter + clone,
// matching the surface AssistantActions relies on.
function makeKerasLayer(name) {
  return {
    name,
    parameterValues: {},
    setParameterValue(paramName, value) {
      this.parameterValues[paramName] = value;
    },
    clone() {
      const copy = makeKerasLayer(this.name);
      copy.parameterValues = JSON.parse(JSON.stringify(this.parameterValues));
      return copy;
    },
  };
}

// A fake $d3Interface mirroring the real add/find/model structure closely
// enough to exercise the actions (activeGraph.model.d3Layers, findLayerById...).
function makeFakeD3Interface() {
  const model = {
    d3Layers: [],
    d3Edges: [],
    modelInputs: [],
    modelOutputs: [],
  };
  let nextId = 1;
  const activeGraph = {
    model,
    toJSON() {
      return JSON.stringify({ layers: model.d3Layers.map(l => l.id) });
    },
    findLayerById(id) {
      return model.d3Layers.find(layer => layer.id === id) || null;
    },
  };
  return {
    activeGraph,
    calls: { deleteSelected: 0, undo: 0, redo: 0 },
    addLayer(kerasLayer) {
      const id = nextId;
      nextId += 1;
      model.d3Layers.push({ id, name: kerasLayer.name, kerasLayer });
    },
    findLayerById(id) {
      return activeGraph.findLayerById(id);
    },
    deleteSelectedElements() {
      this.calls.deleteSelected += 1;
    },
    undo() {
      this.calls.undo += 1;
    },
    redo() {
      this.calls.redo += 1;
    },
  };
}

function makeFakeKerasInterface() {
  const layerList = {
    Dense: makeKerasLayer('Dense'),
    Input: makeKerasLayer('Input'),
  };
  return {
    getLayerList() {
      return layerList;
    },
    generatePython(json) {
      return `# python for ${json}`;
    },
    generateJavascript(json) {
      return `// javascript for ${json}`;
    },
  };
}

// --- Tests ------------------------------------------------------------------
describe('AssistantActions', () => {
  let actions;
  let d3;
  let keras;

  beforeEach(() => {
    d3 = makeFakeD3Interface();
    keras = makeFakeKerasInterface();
    actions = new AssistantActions(d3, keras);
  });

  it('lists available layer types', () => {
    expect(actions.listLayerTypes()).toEqual(['Dense', 'Input']);
  });

  it('adds a layer and lists it', () => {
    const added = actions.addLayer('Dense');
    expect(added.type).toBe('Dense');
    expect(added.id).not.toBeNull();

    const layers = actions.listLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe('Dense');
    expect(layers[0].id).toBe(added.id);
    expect(layers[0].params).toEqual({});
  });

  it('rejects an unknown layer type', () => {
    expect(() => actions.addLayer('NotALayer')).toThrow(/Unknown layer type/);
  });

  it('sets a parameter value on a layer', () => {
    const added = actions.addLayer('Dense');
    const result = actions.setParam(added.id, 'units', 64);
    expect(result.params.units).toBe(64);

    const layers = actions.listLayers();
    expect(layers[0].params.units).toBe(64);
  });

  it('throws when setting a param on a missing layer', () => {
    expect(() => actions.setParam(999, 'units', 1)).toThrow(/No layer with id/);
  });

  it('summarizes the model with counts and a compact layer list', () => {
    actions.addLayer('Input');
    actions.addLayer('Dense');
    d3.activeGraph.model.modelInputs.push(d3.activeGraph.model.d3Layers[0]);
    d3.activeGraph.model.d3Edges.push({});

    const summary = actions.getModelSummary();
    expect(summary.layerCount).toBe(2);
    expect(summary.inputCount).toBe(1);
    expect(summary.outputCount).toBe(0);
    expect(summary.edgeCount).toBe(1);
    expect(summary.layers.map(l => l.type)).toEqual(['Input', 'Dense']);
  });

  it('generates python and javascript code', () => {
    actions.addLayer('Dense');
    expect(actions.generateCode('python')).toContain('# python for');
    expect(actions.generateCode('javascript')).toContain('// javascript for');
    expect(() => actions.generateCode('ruby')).toThrow(/Unknown language/);
  });

  it('delegates delete/undo/redo to the d3 interface', () => {
    actions.deleteSelected();
    actions.undo();
    actions.redo();
    expect(d3.calls).toEqual({ deleteSelected: 1, undo: 1, redo: 1 });
  });

  it('reports a friendly error when no graph is active', () => {
    const bare = new AssistantActions({ activeGraph: null }, keras);
    expect(() => bare.listLayers()).toThrow(/No active graph/);
  });
});

describe('AnthropicClient tool mapping', () => {
  it('builds a valid tools array from the actions', () => {
    const tools = buildTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual([
      'list_layer_types',
      'add_layer',
      'list_layers',
      'set_param',
      'get_model_summary',
      'generate_code',
      'delete_selected',
      'undo',
      'redo',
    ]);
    tools.forEach((tool) => {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    });
  });

  it('executes a mapped tool against the actions', () => {
    const d3 = makeFakeD3Interface();
    const keras = makeFakeKerasInterface();
    const actions = new AssistantActions(d3, keras);
    // add_layer is a mutating tool, so allow edits to exercise the success path.
    const client = new AnthropicClient(actions, { allowEdits: true });

    const listed = client.runTool('list_layer_types', {});
    expect(listed.isError).toBe(false);
    expect(JSON.parse(listed.content)).toEqual(['Dense', 'Input']);

    const added = client.runTool('add_layer', { type_name: 'Dense' });
    expect(added.isError).toBe(false);

    const bad = client.runTool('add_layer', { type_name: 'Nope' });
    expect(bad.isError).toBe(true);

    const unknown = client.runTool('does_not_exist', {});
    expect(unknown.isError).toBe(true);
  });
});

// --- Action input validation (structured tool errors) -----------------------
describe('AssistantActions input validation', () => {
  let actions;
  let d3;
  let keras;

  beforeEach(() => {
    d3 = makeFakeD3Interface();
    keras = makeFakeKerasInterface();
    actions = new AssistantActions(d3, keras);
  });

  it('rejects a non-string / empty layer type', () => {
    expect(() => actions.addLayer('')).toThrow(/non-empty layer type/);
    expect(() => actions.addLayer(null)).toThrow(/non-empty layer type/);
    expect(() => actions.addLayer(42)).toThrow(/non-empty layer type/);
  });

  it('lists the available types when an unknown type is requested', () => {
    expect(() => actions.addLayer('Ghost')).toThrow(/Available types: Dense, Input/);
  });

  it('validates set_param arguments before touching the model', () => {
    const added = actions.addLayer('Dense');
    expect(() => actions.setParam(null, 'units', 1)).toThrow(/requires a layer id/);
    expect(() => actions.setParam(added.id, '', 1)).toThrow(/non-empty parameter name/);
    expect(() => actions.setParam(added.id, 'units', undefined)).toThrow(/requires a value/);
  });

  it('reports a missing layer id distinctly from a bad param', () => {
    expect(() => actions.setParam(999, 'units', 1)).toThrow(/No layer with id/);
  });
});

// --- Guardrail: read-only vs allowed-to-edit --------------------------------
describe('AnthropicClient guardrails', () => {
  let actions;

  beforeEach(() => {
    actions = new AssistantActions(makeFakeD3Interface(), makeFakeKerasInterface());
  });

  it('marks exactly the mutating tools', () => {
    expect([...MUTATING_TOOLS].sort()).toEqual(
      ['add_layer', 'delete_selected', 'redo', 'set_param', 'undo'],
    );
    expect(isMutatingTool('add_layer')).toBe(true);
    expect(isMutatingTool('list_layers')).toBe(false);
  });

  it('advertises mutating tools as such in their descriptions', () => {
    const tools = buildTools();
    tools.forEach((tool) => {
      if (isMutatingTool(tool.name)) {
        expect(tool.description).toMatch(/Modifies the model/);
      } else {
        expect(tool.description).not.toMatch(/Modifies the model/);
      }
    });
  });

  it('blocks mutating tools in read-only mode (the default)', () => {
    const client = new AnthropicClient(actions);
    expect(client.allowEdits).toBe(false);

    const add = client.runTool('add_layer', { type_name: 'Dense' });
    expect(add.isError).toBe(true);
    expect(add.content).toMatch(/Read-only mode/);
    // The model was not mutated.
    expect(actions.listLayers()).toHaveLength(0);

    for (const name of ['set_param', 'delete_selected', 'undo', 'redo']) {
      expect(client.runTool(name, {}).isError).toBe(true);
    }
  });

  it('still allows read-only tools in read-only mode', () => {
    const client = new AnthropicClient(actions);
    expect(client.runTool('list_layer_types', {}).isError).toBe(false);
    expect(client.runTool('get_model_summary', {}).isError).toBe(false);
  });

  it('runs mutating tools once edits are allowed', () => {
    const client = new AnthropicClient(actions, { allowEdits: true });
    expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(false);
    expect(actions.listLayers()).toHaveLength(1);
  });

  it('toggles the guardrail at runtime with setAllowEdits', () => {
    const client = new AnthropicClient(actions);
    expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(true);
    client.setAllowEdits(true);
    expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(false);
    client.setAllowEdits(false);
    expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(true);
  });
});

// --- API key sanity helper --------------------------------------------------
describe('isPlausibleApiKey', () => {
  it('accepts plausible keys and rejects obvious mistakes', () => {
    expect(isPlausibleApiKey('sk-ant-abcdefgh')).toBe(true);
    expect(isPlausibleApiKey('')).toBe(false);
    expect(isPlausibleApiKey('   ')).toBe(false);
    expect(isPlausibleApiKey('short')).toBe(false);
    expect(isPlausibleApiKey(null)).toBe(false);
    expect(isPlausibleApiKey(undefined)).toBe(false);
  });
});

// --- Client network / HTTP error handling (injected fetch) ------------------
describe('AnthropicClient.send error handling', () => {
  let actions;

  beforeEach(() => {
    actions = new AssistantActions(makeFakeD3Interface(), makeFakeKerasInterface());
  });

  function makeClient(fetchImpl, extra = {}) {
    return new AnthropicClient(actions, { apiKey: 'sk-ant-testkey', fetch: fetchImpl, ...extra });
  }

  it('completes a plain text turn', async () => {
    const fetchImpl = makeFakeFetch([textReply('Hello there.')]);
    const client = makeClient(fetchImpl);
    const history = [{ role: 'user', content: 'hi' }];
    const reply = await client.send(history);
    expect(reply).toBe('Hello there.');
    // The request carried the tools and system prompt.
    expect(fetchImpl.calls[0].body.tools.length).toBeGreaterThan(0);
    expect(fetchImpl.calls[0].body.system).toMatch(/NNVP assistant/);
  });

  it('runs a full tool-use loop and feeds tool_result back', async () => {
    const fetchImpl = makeFakeFetch([
      toolReply('t1', 'list_layer_types', {}),
      textReply('There are 2 layer types.'),
    ]);
    const client = makeClient(fetchImpl);
    const history = [{ role: 'user', content: 'what layers exist?' }];
    const seen = [];
    const reply = await client.send(history, e => seen.push(e.type));
    expect(reply).toBe('There are 2 layer types.');
    // The second request must contain a tool_result the model can read.
    const followup = fetchImpl.calls[1].body.messages.at(-1);
    expect(followup.role).toBe('user');
    expect(followup.content[0].type).toBe('tool_result');
    expect(followup.content[0].is_error).toBe(false);
    expect(seen).toContain('tool_use');
    expect(seen).toContain('tool_result');
  });

  it('feeds a guardrail error back to the model in read-only mode', async () => {
    const fetchImpl = makeFakeFetch([
      toolReply('t1', 'add_layer', { type_name: 'Dense' }),
      textReply('I cannot edit in read-only mode.'),
    ]);
    const client = makeClient(fetchImpl); // read-only default
    const history = [{ role: 'user', content: 'add a dense layer' }];
    const reply = await client.send(history);
    expect(reply).toMatch(/read-only/i);
    const toolResult = fetchImpl.calls[1].body.messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toMatch(/Read-only mode/);
  });

  it('surfaces a friendly 401 message', async () => {
    const fetchImpl = makeFakeFetch([
      { ok: false, status: 401, text: JSON.stringify({ error: { message: 'invalid x-api-key' } }) },
    ]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Invalid API key \(401\).*invalid x-api-key/);
  });

  it('surfaces a friendly 429 rate-limit message', async () => {
    const fetchImpl = makeFakeFetch([{ ok: false, status: 429, text: '' }]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Rate limited \(429\)/);
  });

  it('surfaces a generic 500 server error', async () => {
    const fetchImpl = makeFakeFetch([{ ok: false, status: 500, text: '' }]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/internal error \(500\)/);
  });

  it('wraps network failures', async () => {
    const fetchImpl = makeFakeFetch([{ throwErr: new TypeError('Failed to fetch') }]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Network error.*Failed to fetch/);
  });

  it('handles a malformed (non-JSON) response body', async () => {
    const fetchImpl = makeFakeFetch([{ ok: true, status: 200, jsonThrows: true }]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/malformed \(non-JSON\)/);
  });

  it('rejects a response with no content array', async () => {
    const fetchImpl = makeFakeFetch([{ ok: true, status: 200, json: { not: 'content' } }]);
    const client = makeClient(fetchImpl);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/unexpected response shape/);
  });

  it('stops after maxTurns when the model never finishes', async () => {
    // Always ask for a tool, never return final text.
    const fetchImpl = makeFakeFetch([
      toolReply('a', 'list_layers', {}),
      toolReply('b', 'list_layers', {}),
      toolReply('c', 'list_layers', {}),
    ]);
    const client = makeClient(fetchImpl, { maxTurns: 2 });
    await expect(client.send([{ role: 'user', content: 'loop' }]))
      .rejects.toThrow(/used tools 2 times without finishing/);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('refuses to send without an API key', async () => {
    const fetchImpl = makeFakeFetch([textReply('unused')]);
    const client = new AnthropicClient(actions, { apiKey: '', fetch: fetchImpl });
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/No Anthropic API key set/);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('refuses to send with a malformed API key', async () => {
    const fetchImpl = makeFakeFetch([textReply('unused')]);
    const client = new AnthropicClient(actions, { apiKey: 'bad', fetch: fetchImpl });
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/looks malformed/);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe('AnthropicClient backend proxy mode', () => {
  const makeActions = () => new AssistantActions(makeFakeD3Interface(), makeFakeKerasInterface());

  it('posts to <backendUrl>/assistant/messages with the backend JWT and no API key', async () => {
    // backendUrl is the API root (Django mounts under /api), so the assistant
    // route is <backendUrl>/assistant/messages — no extra /api segment.
    const fetchImpl = makeFakeFetch([textReply('ok')]);
    const client = new AnthropicClient(makeActions(), {
      fetch: fetchImpl,
      baseUrl: 'http://localhost:8009/api/',
      backendUrl: 'http://localhost:8009/api',
      backendToken: 'backend-jwt',
    });
    const reply = await client.send([{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('ok');
    expect(fetchImpl.calls[0].url).toBe('http://localhost:8009/api/assistant/messages');
    expect(fetchImpl.calls[0].init.headers.authorization).toBe('Bearer backend-jwt');
    expect(fetchImpl.calls[0].init.headers['x-api-key']).toBeUndefined();
  });

  it('resolves the same-origin default ("/api") to /api/assistant/messages', async () => {
    // The real app never overrides backendUrl: it is the constant '/api'.
    const fetchImpl = makeFakeFetch([textReply('ok')]);
    const client = new AnthropicClient(makeActions(), {
      fetch: fetchImpl,
      backendToken: 'backend-jwt',
    });
    await client.send([{ role: 'user', content: 'hi' }]);
    expect(fetchImpl.calls[0].url).toBe('/api/assistant/messages');
    expect(fetchImpl.calls[0].init.headers.authorization).toBe('Bearer backend-jwt');
    expect(fetchImpl.calls[0].init.headers['x-api-key']).toBeUndefined();
  });

  it('asks the user to sign in when the backend proxy is selected without a token', async () => {
    const client = new AnthropicClient(makeActions(), {
      fetch: makeFakeFetch([]),
      baseUrl: 'http://localhost:8009',
      backendUrl: 'http://localhost:8009',
    });
    await expect(client.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Sign in/);
  });

  it('treats a non-backend custom base URL as an Anthropic-compatible proxy', async () => {
    const fetchImpl = makeFakeFetch([textReply('ok')]);
    const client = new AnthropicClient(makeActions(), {
      fetch: fetchImpl,
      apiKey: 'sk-ant-testkey',
      baseUrl: 'https://myproxy.example.com',
      backendUrl: 'http://localhost:8009',
      backendToken: 'backend-jwt',
    });
    await client.send([{ role: 'user', content: 'hi' }]);
    expect(fetchImpl.calls[0].url).toBe('https://myproxy.example.com/v1/messages');
    expect(fetchImpl.calls[0].init.headers['x-api-key']).toBe('sk-ant-testkey');
    expect(fetchImpl.calls[0].init.headers.authorization).toBeUndefined();
  });
});

// --- Config resolution: who talks to what, by default -----------------------
// Precedence: explicit base URL > (signed in + no own key -> backend proxy)
// > public Anthropic API.
describe('readStoredConfig resolution', () => {
  it('defaults a signed-in user with no key and no base URL to the backend proxy', () => {
    const config = readStoredConfig({ backendToken: 'backend-jwt' });
    expect(config.baseUrl).toBe('/api');
    expect(config.backendUrl).toBe('/api');
    expect(usesBackendProxy(config)).toBe(true);
  });

  it('lets a user-provided API key win over the signed-in proxy default', () => {
    const config = readStoredConfig({ backendToken: 'backend-jwt', apiKey: 'sk-ant-testkey' });
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(usesBackendProxy(config)).toBe(false);
  });

  it('lets an explicit custom base URL win over the signed-in proxy default', () => {
    const config = readStoredConfig({
      backendToken: 'backend-jwt',
      baseUrl: 'https://myproxy.example.com',
    });
    expect(config.baseUrl).toBe('https://myproxy.example.com');
    expect(usesBackendProxy(config)).toBe(false);
  });

  it('still honors an explicitly typed "/api" base URL even when signed out', () => {
    const config = readStoredConfig({ baseUrl: '/api' });
    expect(usesBackendProxy(config)).toBe(true);
    expect(config.backendToken).toBe('');
  });

  it('falls back to the public Anthropic API when signed out with no key', () => {
    const config = readStoredConfig({});
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(usesBackendProxy(config)).toBe(false);
  });
});

// --- Backend proxy error mapping ---------------------------------------------
describe('AnthropicClient backend proxy errors', () => {
  const makeActions = () => new AssistantActions(makeFakeD3Interface(), makeFakeKerasInterface());

  function makeProxyClient(queue) {
    const fetchImpl = makeFakeFetch(queue);
    const client = new AnthropicClient(makeActions(), {
      fetch: fetchImpl,
      backendToken: 'backend-jwt',
    });
    return { client, fetchImpl };
  }

  it('maps 401 (expired/unverified token) to a sign-in message', async () => {
    const { client } = makeProxyClient([{ ok: false, status: 401, text: '' }]);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Sign in again \(Account menu\)/);
  });

  it('maps 429 to a short rate-limit message', async () => {
    const { client } = makeProxyClient([{ ok: false, status: 429, text: '' }]);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Rate limited \(429\)\. Try again in a bit\./);
  });

  it('maps 5xx to a backend-problem message', async () => {
    for (const status of [500, 503]) {
      const { client } = makeProxyClient([{ ok: false, status, text: '' }]);
      await expect(client.send([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow(new RegExp(`NNVP backend had a problem \\(${status}\\)`));
    }
  });

  it('maps network failures to a backend-unreachable message', async () => {
    const { client } = makeProxyClient([{ throwErr: new TypeError('Failed to fetch') }]);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/Could not reach the NNVP backend.*Failed to fetch/);
  });

  it('suggests signing in when there is no key and no token', async () => {
    const fetchImpl = makeFakeFetch([]);
    const client = new AnthropicClient(makeActions(), { fetch: fetchImpl });
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(/No Anthropic API key set.*sign in \(Account menu\)/);
    expect(fetchImpl.calls).toHaveLength(0);
  });
});
