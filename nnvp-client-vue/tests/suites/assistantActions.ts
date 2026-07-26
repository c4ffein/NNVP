/**
 * Assistant actions + Anthropic client (injected fakes, no network, no Vue).
 * Migrated from tests/unit/assistantActions.test.js into the dual registry as
 * logicTest. The per-describe beforeEach blocks became small setup helpers
 * called at the top of each test.
 */
import { logicTest } from '../harness/define';
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
import type {
  AnthropicClientOptions,
  AnthropicMessage,
  AnthropicTool,
  AnthropicToolResultBlock,
  AssistantActivity,
} from '../../src/lib/Assistant/anthropicClient';
import type BoardInterface from '../../src/lib/BoardInterface/BoardInterface';
import type KerasInterface from '../../src/lib/KerasInterface/KerasInterface';
import type { NnvpLayerId, ParameterValue } from '../../src/types/model';
import { bus } from '../../src/lib/Events/bus';

// One queued fake response: { ok, status, json, text, throwErr, jsonThrows }.
interface FakeResponseSpec {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  throwErr?: Error;
  jsonThrows?: boolean;
}

/** The JSON body the client POSTs to the messages endpoint, as tests read it. */
interface RecordedRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: AnthropicMessage[];
  tools: AnthropicTool[];
}

interface RecordedCall {
  url: RequestInfo | URL;
  init: { method?: string; headers?: Record<string, string>; body?: string } | undefined;
  body: RecordedRequestBody | null;
}

type FakeFetch = typeof fetch & { calls: RecordedCall[] };

// A fake fetch returning a canned Anthropic-style response. `queue` is a list of
// { ok, status, json, text, throwErr } descriptors consumed one per call, so a
// test can script a whole tool-use loop (or an error) turn by turn.
function makeFakeFetch(queue: FakeResponseSpec[]): FakeFetch {
  const calls: RecordedCall[] = [];
  const impl = (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const recorded = init as RecordedCall['init'];
    calls.push({
      url,
      init: recorded,
      body: recorded && recorded.body
        ? JSON.parse(recorded.body) as RecordedRequestBody
        : null,
    });
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
    } as unknown as Response);
  };
  return Object.assign(impl, { calls });
}

// Shorthand for a normal assistant reply containing a single text block.
function textReply(text: string): FakeResponseSpec {
  return { json: { content: [{ type: 'text', text }] } };
}

// Shorthand for an assistant reply that calls one tool.
function toolReply(id: string, name: string, input: Record<string, unknown>): FakeResponseSpec {
  return { json: { content: [{ type: 'tool_use', id, name, input }] } };
}

// --- Fakes ------------------------------------------------------------------
// A minimal stand-in for a KerasLayer: name + parameterValues + setter + clone,
// matching the surface AssistantActions relies on.
interface FakeKerasLayer {
  name: string;
  parameterValues: Record<string, unknown>;
  setParameterValue(paramName: string, value: unknown): void;
  clone(): FakeKerasLayer;
}

function makeKerasLayer(name: string): FakeKerasLayer {
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

interface FakeLayerEntry {
  id: number;
  name: string;
  kerasLayer: FakeKerasLayer | null;
}

interface FakeEdge {
  source?: NnvpLayerId;
  target?: NnvpLayerId;
}

interface FakeModel {
  layers: FakeLayerEntry[];
  edges: FakeEdge[];
  modelInputs: FakeLayerEntry[];
  modelOutputs: FakeLayerEntry[];
}

// A fake $boardInterface mirroring the real facade structure closely enough
// to exercise the actions (the getLayers/getEdges/... read getters,
// findLayerById...). Deliberately partial: cast to BoardInterface only at the
// constructor seam.
interface FakeBoardInterface {
  activeGraph: {
    model: FakeModel;
    toJSON(): string;
    findLayerById(id: NnvpLayerId): FakeLayerEntry | null;
  };
  getLayers(): FakeLayerEntry[];
  getEdges(): FakeEdge[];
  getModelInputs(): FakeLayerEntry[];
  getModelOutputs(): FakeLayerEntry[];
  calls: {
    deleteSelected: number;
    undo: number;
    redo: number;
    autoLayout: number;
    loadedTemplates: string[];
  };
  addLayer(kerasLayer: FakeKerasLayer): void;
  findLayerById(id: NnvpLayerId): FakeLayerEntry | null;
  deleteSelectedElements(): void;
  autoLayout(): void;
  undo(): void;
  redo(): void;
  getTemplatesContainer(): { e: string[] };
  loadTemplate(name: string): void;
  connectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean;
  disconnectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId): boolean;
}

function makeFakeBoardInterface(): FakeBoardInterface {
  const model: FakeModel = {
    layers: [],
    edges: [],
    modelInputs: [],
    modelOutputs: [],
  };
  let nextId = 1;
  const activeGraph = {
    model,
    toJSON() {
      return JSON.stringify({ layers: model.layers.map(l => l.id) });
    },
    findLayerById(id: NnvpLayerId) {
      return model.layers.find(layer => layer.id === id) || null;
    },
  };
  return {
    activeGraph,
    getLayers() { return model.layers; },
    getEdges() { return model.edges; },
    getModelInputs() { return model.modelInputs; },
    getModelOutputs() { return model.modelOutputs; },
    calls: {
      deleteSelected: 0, undo: 0, redo: 0, autoLayout: 0, loadedTemplates: [],
    },
    addLayer(kerasLayer) {
      const id = nextId;
      nextId += 1;
      model.layers.push({ id, name: kerasLayer.name, kerasLayer });
    },
    findLayerById(id) {
      return activeGraph.findLayerById(id);
    },
    deleteSelectedElements() {
      this.calls.deleteSelected += 1;
    },
    autoLayout() {
      this.calls.autoLayout += 1;
    },
    undo() {
      this.calls.undo += 1;
    },
    redo() {
      this.calls.redo += 1;
    },
    getTemplatesContainer() {
      return { e: ['2D Dense for MNIST', 'Tiny CNN'] };
    },
    loadTemplate(name) {
      this.calls.loadedTemplates.push(name);
      model.layers.push({ id: nextId, name: 'FromTemplate', kerasLayer: null });
      nextId += 1;
    },
    connectLayers(sourceId, targetId) {
      if (sourceId === targetId) return false;
      if (model.edges.some(e => e.source === sourceId && e.target === targetId)) return false;
      model.edges.push({ source: sourceId, target: targetId });
      return true;
    },
    disconnectLayers(sourceId, targetId) {
      const before = model.edges.length;
      model.edges = model.edges.filter(
        e => !(e.source === sourceId && e.target === targetId),
      );
      return model.edges.length < before;
    },
  };
}

interface FakeKerasInterface {
  getLayerList(): Record<string, FakeKerasLayer>;
  generatePython(json: string): string;
  generateJavascript(json: string): string;
}

function makeFakeKerasInterface(): FakeKerasInterface {
  const layerList: Record<string, FakeKerasLayer> = {
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

const asBoard = (fake: unknown) => fake as BoardInterface;
const asKeras = (fake: unknown) => fake as KerasInterface;

// Former beforeEach: fresh fakes + actions per test.
function setup() {
  const d3 = makeFakeBoardInterface();
  const keras = makeFakeKerasInterface();
  const actions = new AssistantActions(asBoard(d3), asKeras(keras));
  return { d3, keras, actions };
}

// --- Tests: AssistantActions --------------------------------------------------

logicTest('assistantActions: lists available layer types', ({ expect }) => {
  const { actions } = setup();
  expect(actions.listLayerTypes()).toEqual(['Dense', 'Input']);
});

logicTest('assistantActions: adds a layer and lists it', ({ expect }) => {
  const { actions } = setup();
  const added = actions.addLayer('Dense');
  expect(added.type).toBe('Dense');
  expect(added.id).not.toBeNull();

  const layers = actions.listLayers();
  expect(layers).toHaveLength(1);
  expect(layers[0]!.type).toBe('Dense');
  expect(layers[0]!.id).toBe(added.id);
  expect(layers[0]!.params).toEqual({});
});

logicTest('assistantActions: rejects an unknown layer type', ({ expect }) => {
  const { actions } = setup();
  expect(() => actions.addLayer('NotALayer')).toThrow(/Unknown layer type/);
});

logicTest('assistantActions: sets a parameter value on a layer', ({ expect }) => {
  const { actions } = setup();
  const added = actions.addLayer('Dense');
  const result = actions.setParam(added.id!, 'units', 64);
  expect(result.params.units).toBe(64);

  const layers = actions.listLayers();
  expect(layers[0]!.params.units).toBe(64);
});

logicTest('assistantActions: throws when setting a param on a missing layer', ({ expect }) => {
  const { actions } = setup();
  expect(() => actions.setParam(999, 'units', 1)).toThrow(/No layer with id/);
});

logicTest('assistantActions: summarizes the model with counts and a compact layer list', ({ expect }) => {
  const { d3, actions } = setup();
  actions.addLayer('Input');
  actions.addLayer('Dense');
  d3.getModelInputs().push(d3.getLayers()[0]!);
  d3.getEdges().push({});

  const summary = actions.getModelSummary();
  expect(summary.layerCount).toBe(2);
  expect(summary.inputCount).toBe(1);
  expect(summary.outputCount).toBe(0);
  expect(summary.edgeCount).toBe(1);
  expect(summary.layers.map(l => l.type)).toEqual(['Input', 'Dense']);
});

logicTest('assistantActions: generates python and javascript code', ({ expect }) => {
  const { actions } = setup();
  actions.addLayer('Dense');
  expect(actions.generateCode('python')).toContain('# python for');
  expect(actions.generateCode('javascript')).toContain('// javascript for');
  expect(() => actions.generateCode('ruby')).toThrow(/Unknown language/);
});

logicTest('assistantActions: delegates delete/undo/redo to the d3 interface', ({ expect }) => {
  const { d3, actions } = setup();
  actions.deleteSelected();
  actions.undo();
  actions.redo();
  expect(d3.calls).toEqual({
    deleteSelected: 1, undo: 1, redo: 1, autoLayout: 0, loadedTemplates: [],
  });
});

logicTest('assistantActions: reports a friendly error when no graph is active', ({ expect }) => {
  const { keras } = setup();
  const bare = new AssistantActions(asBoard({ activeGraph: null }), asKeras(keras));
  expect(() => bare.listLayers()).toThrow(/No active graph/);
});

logicTest('assistantActions: startTutorial emits the app-level bus event', ({ expect }) => {
  const { actions } = setup();
  const received: unknown[] = [];
  const off = bus.on('ui.start-tutorial', payload => received.push(payload));
  try {
    const result = actions.startTutorial('connect-layers');
    expect(result.started).toBe('connect-layers');
    expect(typeof result.title).toBe('string');
    expect(received).toEqual([{ id: 'connect-layers' }]);
  } finally {
    off();
  }
});

logicTest('assistantActions: openTrainingPanel emits the app-level bus event', ({ expect }) => {
  const { actions } = setup();
  let received = 0;
  const off = bus.on('ui.open-training', () => { received += 1; });
  try {
    expect(actions.openTrainingPanel()).toEqual({ opened: true });
    expect(received).toBe(1);
  } finally {
    off();
  }
});

logicTest('assistantActions: startTutorial rejects unknown ids without emitting', ({ expect }) => {
  const { actions } = setup();
  const received: unknown[] = [];
  const off = bus.on('ui.start-tutorial', payload => received.push(payload));
  try {
    expect(() => actions.startTutorial('ghost-tutorial')).toThrow(/Available ids: /);
    expect(received).toEqual([]);
  } finally {
    off();
  }
});

logicTest('assistantActions: connects two layers and reports the pair', ({ expect }) => {
  const { d3, actions } = setup();
  const a = actions.addLayer('Input');
  const b = actions.addLayer('Dense');
  const result = actions.connectLayers(a.id!, b.id!);
  expect(result).toEqual({ connected: true, source: a.id, target: b.id });
  expect(d3.getEdges()).toEqual([{ source: a.id, target: b.id }]);
});

logicTest('assistantActions: edge tools name the missing layer id', ({ expect }) => {
  const { actions } = setup();
  const a = actions.addLayer('Dense');
  expect(() => actions.connectLayers(999, a.id!)).toThrow(/No source layer with id "999"/);
  expect(() => actions.connectLayers(a.id!, 999)).toThrow(/No target layer with id "999"/);
  expect(() => actions.disconnectLayers(999, a.id!)).toThrow(/No source layer/);
});

logicTest('assistantActions: surfaces refused connections and missing edges as errors', ({ expect }) => {
  const { actions } = setup();
  const a = actions.addLayer('Input');
  const b = actions.addLayer('Dense');
  actions.connectLayers(a.id!, b.id!);
  expect(() => actions.connectLayers(a.id!, b.id!)).toThrow(/already exists.*self-loop/);
  expect(() => actions.disconnectLayers(b.id!, a.id!)).toThrow(/no .* connection to remove/);
  const gone = actions.disconnectLayers(a.id!, b.id!);
  expect(gone).toEqual({ disconnected: true, source: a.id, target: b.id });
});

logicTest('assistantActions: autoLayout delegates to the board facade', ({ expect }) => {
  const { d3, actions } = setup();
  expect(actions.autoLayout()).toEqual({ arranged: true });
  expect(d3.calls.autoLayout).toBe(1);
});

// --- AnthropicClient tool mapping ----------------------------------------------

logicTest('anthropicClient: builds a valid tools array from the actions', ({ expect }) => {
  const tools = buildTools();
  const names = tools.map(t => t.name);
  expect(names).toEqual([
    'list_layer_types',
    'add_layer',
    'list_layers',
    'set_param',
    'get_model_summary',
    'generate_code',
    'connect_layers',
    'disconnect_layers',
    'auto_layout',
    'propose_choices',
    'delete_selected',
    'undo',
    'redo',
    'list_templates',
    'load_template',
    'list_tutorials',
    'start_tutorial',
    'open_training_panel',
    'get_layer_help',
  ]);
  tools.forEach((tool) => {
    expect(typeof tool.name).toBe('string');
    expect(typeof tool.description).toBe('string');
    expect(tool.input_schema).toBeDefined();
    expect(tool.input_schema.type).toBe('object');
  });
});

logicTest('anthropicClient: executes a mapped tool against the actions', ({ expect }) => {
  const d3 = makeFakeBoardInterface();
  const keras = makeFakeKerasInterface();
  const actions = new AssistantActions(asBoard(d3), asKeras(keras));
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

// --- Action input validation (structured tool errors) -----------------------

logicTest('assistantActions: rejects a non-string / empty layer type', ({ expect }) => {
  const { actions } = setup();
  expect(() => actions.addLayer('')).toThrow(/non-empty layer type/);
  expect(() => actions.addLayer(null as unknown as string)).toThrow(/non-empty layer type/);
  expect(() => actions.addLayer(42 as unknown as string)).toThrow(/non-empty layer type/);
});

logicTest('assistantActions: lists the available types when an unknown type is requested', ({ expect }) => {
  const { actions } = setup();
  expect(() => actions.addLayer('Ghost')).toThrow(/Available types: Dense, Input/);
});

logicTest('assistantActions: validates set_param arguments before touching the model', ({ expect }) => {
  const { actions } = setup();
  const added = actions.addLayer('Dense');
  expect(() => actions.setParam(null as unknown as NnvpLayerId, 'units', 1)).toThrow(/requires a layer id/);
  expect(() => actions.setParam(added.id!, '', 1)).toThrow(/non-empty parameter name/);
  expect(() => actions.setParam(added.id!, 'units', undefined as unknown as ParameterValue)).toThrow(/requires a value/);
});

logicTest('assistantActions: reports a missing layer id distinctly from a bad param', ({ expect }) => {
  const { actions } = setup();
  expect(() => actions.setParam(999, 'units', 1)).toThrow(/No layer with id/);
});

// --- Guardrail: read-only vs allowed-to-edit --------------------------------

logicTest('anthropicClient: marks exactly the mutating tools', ({ expect }) => {
  expect([...MUTATING_TOOLS].sort()).toEqual(
    ['add_layer', 'auto_layout', 'connect_layers', 'delete_selected',
      'disconnect_layers', 'load_template', 'redo', 'set_param', 'undo'],
  );
  expect(isMutatingTool('load_template')).toBe(true); // replaces the board
  expect(isMutatingTool('list_templates')).toBe(false);
  expect(isMutatingTool('list_tutorials')).toBe(false);
  expect(isMutatingTool('start_tutorial')).toBe(false); // navigation, not a graph edit
  expect(isMutatingTool('open_training_panel')).toBe(false); // navigation too
  expect(isMutatingTool('auto_layout')).toBe(true); // moves every layer
  expect(isMutatingTool('propose_choices')).toBe(false); // pure UI affordance
  expect(isMutatingTool('get_layer_help')).toBe(false);
  expect(isMutatingTool('add_layer')).toBe(true);
  expect(isMutatingTool('list_layers')).toBe(false);
});

logicTest('anthropicClient: advertises mutating tools as such in their descriptions', ({ expect }) => {
  const tools = buildTools();
  tools.forEach((tool) => {
    if (isMutatingTool(tool.name)) {
      expect(tool.description).toMatch(/Modifies the model/);
    } else {
      expect(tool.description).not.toMatch(/Modifies the model/);
    }
  });
});

logicTest('anthropicClient: blocks mutating tools in read-only mode (the default)', ({ expect }) => {
  const { actions } = setup();
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

logicTest('anthropicClient: still allows read-only tools in read-only mode', ({ expect }) => {
  const { actions } = setup();
  const client = new AnthropicClient(actions);
  expect(client.runTool('list_layer_types', {}).isError).toBe(false);
  expect(client.runTool('get_model_summary', {}).isError).toBe(false);
});

logicTest('anthropicClient: runs mutating tools once edits are allowed', ({ expect }) => {
  const { actions } = setup();
  const client = new AnthropicClient(actions, { allowEdits: true });
  expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(false);
  expect(actions.listLayers()).toHaveLength(1);
});

logicTest('anthropicClient: toggles the guardrail at runtime with setAllowEdits', ({ expect }) => {
  const { actions } = setup();
  const client = new AnthropicClient(actions);
  expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(true);
  client.setAllowEdits(true);
  expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(false);
  client.setAllowEdits(false);
  expect(client.runTool('add_layer', { type_name: 'Dense' }).isError).toBe(true);
});

// --- API key sanity helper --------------------------------------------------

logicTest('anthropicClient: isPlausibleApiKey accepts plausible keys and rejects obvious mistakes', ({ expect }) => {
  expect(isPlausibleApiKey('sk-ant-abcdefgh')).toBe(true);
  expect(isPlausibleApiKey('')).toBe(false);
  expect(isPlausibleApiKey('   ')).toBe(false);
  expect(isPlausibleApiKey('short')).toBe(false);
  expect(isPlausibleApiKey(null)).toBe(false);
  expect(isPlausibleApiKey(undefined)).toBe(false);
});

// --- Client network / HTTP error handling (injected fetch) ------------------

function makeClient(fetchImpl: FakeFetch, extra: AnthropicClientOptions = {}) {
  const { actions } = setup();
  return new AnthropicClient(actions, { apiKey: 'sk-ant-testkey', fetch: fetchImpl, ...extra });
}

logicTest('anthropicClient: completes a plain text turn', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([textReply('Hello there.')]);
  const client = makeClient(fetchImpl);
  const history: AnthropicMessage[] = [{ role: 'user', content: 'hi' }];
  const reply = await client.send(history);
  expect(reply).toBe('Hello there.');
  // The request carried the tools and system prompt.
  expect(fetchImpl.calls[0]!.body!.tools.length).toBeGreaterThan(0);
  expect(fetchImpl.calls[0]!.body!.system).toMatch(/NNVP assistant/);
});

logicTest('anthropicClient: runs a full tool-use loop and feeds tool_result back', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([
    toolReply('t1', 'list_layer_types', {}),
    textReply('There are 2 layer types.'),
  ]);
  const client = makeClient(fetchImpl);
  const history: AnthropicMessage[] = [{ role: 'user', content: 'what layers exist?' }];
  const seen: string[] = [];
  const reply = await client.send(history, e => seen.push(e.type));
  expect(reply).toBe('There are 2 layer types.');
  // The second request must contain a tool_result the model can read.
  const followup = fetchImpl.calls[1]!.body!.messages.at(-1)!;
  expect(followup.role).toBe('user');
  const followupBlock = (followup.content as AnthropicToolResultBlock[])[0]!;
  expect(followupBlock.type).toBe('tool_result');
  expect(followupBlock.is_error).toBe(false);
  expect(seen).toContain('tool_use');
  expect(seen).toContain('tool_result');
});

logicTest('anthropicClient: feeds a guardrail error back to the model in read-only mode', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([
    toolReply('t1', 'add_layer', { type_name: 'Dense' }),
    textReply('I cannot edit in read-only mode.'),
  ]);
  const client = makeClient(fetchImpl); // read-only default
  const history: AnthropicMessage[] = [{ role: 'user', content: 'add a dense layer' }];
  const reply = await client.send(history);
  expect(reply).toMatch(/read-only/i);
  const toolResult = (fetchImpl.calls[1]!.body!.messages.at(-1)!
    .content as AnthropicToolResultBlock[])[0]!;
  expect(toolResult.is_error).toBe(true);
  expect(toolResult.content).toMatch(/Read-only mode/);
});

logicTest('anthropicClient: surfaces a friendly 401 message', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([
    { ok: false, status: 401, text: JSON.stringify({ error: { message: 'invalid x-api-key' } }) },
  ]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Invalid API key \(401\).*invalid x-api-key/);
});

logicTest('anthropicClient: surfaces a friendly 429 rate-limit message', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([{ ok: false, status: 429, text: '' }]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Rate limited \(429\)/);
});

logicTest('anthropicClient: surfaces a generic 500 server error', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([{ ok: false, status: 500, text: '' }]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/internal error \(500\)/);
});

logicTest('anthropicClient: wraps network failures', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([{ throwErr: new TypeError('Failed to fetch') }]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Network error.*Failed to fetch/);
});

logicTest('anthropicClient: handles a malformed (non-JSON) response body', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([{ ok: true, status: 200, jsonThrows: true }]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/malformed \(non-JSON\)/);
});

logicTest('anthropicClient: rejects a response with no content array', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([{ ok: true, status: 200, json: { not: 'content' } }]);
  const client = makeClient(fetchImpl);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/unexpected response shape/);
});

logicTest('anthropicClient: stops after maxTurns when the model never finishes', async ({ expect }) => {
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

logicTest('anthropicClient: refuses to send without an API key', async ({ expect }) => {
  const { actions } = setup();
  const fetchImpl = makeFakeFetch([textReply('unused')]);
  const client = new AnthropicClient(actions, { apiKey: '', fetch: fetchImpl });
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/No Anthropic API key set/);
  expect(fetchImpl.calls).toHaveLength(0);
});

logicTest('anthropicClient: refuses to send with a malformed API key', async ({ expect }) => {
  const { actions } = setup();
  const fetchImpl = makeFakeFetch([textReply('unused')]);
  const client = new AnthropicClient(actions, { apiKey: 'bad', fetch: fetchImpl });
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/looks malformed/);
  expect(fetchImpl.calls).toHaveLength(0);
});

// --- Backend proxy mode ---------------------------------------------------------

const makeActions = () => new AssistantActions(
  asBoard(makeFakeBoardInterface()), asKeras(makeFakeKerasInterface()),
);

logicTest('anthropicClient: posts to <backendUrl>/assistant/messages with the backend JWT and no API key', async ({ expect }) => {
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
  expect(fetchImpl.calls[0]!.url).toBe('http://localhost:8009/api/assistant/messages');
  expect(fetchImpl.calls[0]!.init!.headers!.authorization).toBe('Bearer backend-jwt');
  expect(fetchImpl.calls[0]!.init!.headers!['x-api-key']).toBeUndefined();
});

logicTest('anthropicClient: resolves the same-origin default ("/api") to /api/assistant/messages', async ({ expect }) => {
  // The real app never overrides backendUrl: it is the constant '/api'.
  const fetchImpl = makeFakeFetch([textReply('ok')]);
  const client = new AnthropicClient(makeActions(), {
    fetch: fetchImpl,
    backendToken: 'backend-jwt',
  });
  await client.send([{ role: 'user', content: 'hi' }]);
  expect(fetchImpl.calls[0]!.url).toBe('/api/assistant/messages');
  expect(fetchImpl.calls[0]!.init!.headers!.authorization).toBe('Bearer backend-jwt');
  expect(fetchImpl.calls[0]!.init!.headers!['x-api-key']).toBeUndefined();
});

logicTest('anthropicClient: asks the user to sign in when the backend proxy is selected without a token', async ({ expect }) => {
  const client = new AnthropicClient(makeActions(), {
    fetch: makeFakeFetch([]),
    baseUrl: 'http://localhost:8009',
    backendUrl: 'http://localhost:8009',
  });
  await expect(client.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Sign in/);
});

logicTest('anthropicClient: treats a non-backend custom base URL as an Anthropic-compatible proxy', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([textReply('ok')]);
  const client = new AnthropicClient(makeActions(), {
    fetch: fetchImpl,
    apiKey: 'sk-ant-testkey',
    baseUrl: 'https://myproxy.example.com',
    backendUrl: 'http://localhost:8009',
    backendToken: 'backend-jwt',
  });
  await client.send([{ role: 'user', content: 'hi' }]);
  expect(fetchImpl.calls[0]!.url).toBe('https://myproxy.example.com/v1/messages');
  expect(fetchImpl.calls[0]!.init!.headers!['x-api-key']).toBe('sk-ant-testkey');
  expect(fetchImpl.calls[0]!.init!.headers!.authorization).toBeUndefined();
});

// --- Config resolution: who talks to what, by default -----------------------
// Precedence: explicit base URL > (signed in + no own key -> backend proxy)
// > public Anthropic API.

logicTest('anthropicClient: readStoredConfig defaults a signed-in user with no key and no base URL to the backend proxy', ({ expect }) => {
  const config = readStoredConfig({ backendToken: 'backend-jwt' });
  expect(config.baseUrl).toBe('/api');
  expect(config.backendUrl).toBe('/api');
  expect(usesBackendProxy(config)).toBe(true);
});

logicTest('anthropicClient: readStoredConfig lets a user-provided API key win over the signed-in proxy default', ({ expect }) => {
  const config = readStoredConfig({ backendToken: 'backend-jwt', apiKey: 'sk-ant-testkey' });
  expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  expect(usesBackendProxy(config)).toBe(false);
});

logicTest('anthropicClient: readStoredConfig lets an explicit custom base URL win over the signed-in proxy default', ({ expect }) => {
  const config = readStoredConfig({
    backendToken: 'backend-jwt',
    baseUrl: 'https://myproxy.example.com',
  });
  expect(config.baseUrl).toBe('https://myproxy.example.com');
  expect(usesBackendProxy(config)).toBe(false);
});

logicTest('anthropicClient: readStoredConfig still honors an explicitly typed "/api" base URL even when signed out', ({ expect }) => {
  const config = readStoredConfig({ baseUrl: '/api' });
  expect(usesBackendProxy(config)).toBe(true);
  expect(config.backendToken).toBe('');
});

logicTest('anthropicClient: readStoredConfig falls back to the public Anthropic API when signed out with no key', ({ expect }) => {
  const config = readStoredConfig({});
  expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  expect(usesBackendProxy(config)).toBe(false);
});

// --- Backend proxy error mapping ---------------------------------------------

function makeProxyClient(queue: FakeResponseSpec[]) {
  const fetchImpl = makeFakeFetch(queue);
  const client = new AnthropicClient(makeActions(), {
    fetch: fetchImpl,
    backendToken: 'backend-jwt',
  });
  return { client, fetchImpl };
}

logicTest('anthropicClient: maps 401 (expired/unverified token) to a sign-in message', async ({ expect }) => {
  const { client } = makeProxyClient([{ ok: false, status: 401, text: '' }]);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Sign in again \(Account menu\)/);
});

logicTest('anthropicClient: maps 429 to a short rate-limit message', async ({ expect }) => {
  const { client } = makeProxyClient([{ ok: false, status: 429, text: '' }]);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Rate limited \(429\)\. Try again in a bit\./);
});

logicTest('anthropicClient: maps 5xx to a backend-problem message', async ({ expect }) => {
  for (const status of [500, 503]) {
    const { client } = makeProxyClient([{ ok: false, status, text: '' }]);
    await expect(client.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow(new RegExp(`NNVP backend had a problem \\(${status}\\)`));
  }
});

logicTest('anthropicClient: maps network failures to a backend-unreachable message', async ({ expect }) => {
  const { client } = makeProxyClient([{ throwErr: new TypeError('Failed to fetch') }]);
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/Could not reach the NNVP backend.*Failed to fetch/);
});

logicTest('anthropicClient: suggests signing in when there is no key and no token', async ({ expect }) => {
  const fetchImpl = makeFakeFetch([]);
  const client = new AnthropicClient(makeActions(), { fetch: fetchImpl });
  await expect(client.send([{ role: 'user', content: 'hi' }]))
    .rejects.toThrow(/No Anthropic API key set.*sign in \(Account menu\)/);
  expect(fetchImpl.calls).toHaveLength(0);
});

// --- Tests: templates / tutorials / in-app docs tools -------------------------

logicTest('assistantActions: lists the available templates', ({ expect }) => {
  const { actions } = setup();
  expect(actions.listTemplates()).toEqual(['2D Dense for MNIST', 'Tiny CNN']);
});

logicTest('assistantActions: loads a known template and reports the result', ({ expect }) => {
  const { d3, actions } = setup();
  const result = actions.loadTemplate('Tiny CNN');
  expect(d3.calls.loadedTemplates).toEqual(['Tiny CNN']);
  expect(result.loaded).toBe('Tiny CNN');
  expect(result.layerCount).toBe(1);
});

logicTest('assistantActions: refuses unknown templates with the available list', ({ expect }) => {
  const { d3, actions } = setup();
  expect(() => actions.loadTemplate('Nope')).toThrow(/Unknown template "Nope".*2D Dense for MNIST/);
  expect(d3.calls.loadedTemplates).toEqual([]);
});

logicTest('assistantActions: lists the real tutorials with their step titles', ({ expect }) => {
  const { actions } = setup();
  const listed = actions.listTutorials();
  expect(listed.length).toBeGreaterThan(0);
  for (const tutorial of listed) {
    expect(typeof tutorial.id).toBe('string');
    expect(typeof tutorial.title).toBe('string');
    expect(typeof tutorial.description).toBe('string');
    expect(Array.isArray(tutorial.steps)).toBe(true);
    expect(tutorial.steps.length).toBeGreaterThan(0);
  }
});

logicTest('assistantActions: serves layer and category help as plain text', ({ expect }) => {
  const { actions } = setup();
  const dense = actions.getLayerHelp('Dense');
  expect(dense.length).toBeGreaterThan(50);
  expect(dense).not.toContain('<'); // HTML stripped
  const category = actions.getLayerHelp('Convolution');
  expect(category).toContain('Conv2D');
  expect(() => actions.getLayerHelp('NotAThing')).toThrow(/No help entry/);
});

logicTest('anthropicClient: propose_choices reaches onActivity and the loop completes', async ({ expect }) => {
  const d3 = makeFakeBoardInterface();
  const keras = makeFakeKerasInterface();
  const actions = new AssistantActions(asBoard(d3), asKeras(keras));
  const client = new AnthropicClient(actions, { allowEdits: false });
  client.fetchImpl = makeFakeFetch([
    toolReply('t1', 'propose_choices', { choices: ['Yes, tidy it', 'No thanks'] }),
    textReply('Want me to tidy the layout?'),
  ]);
  localStorage.setItem('nnvp_anthropic_key', 'sk-ant-test-0000000000');
  try {
    const events: AssistantActivity[] = [];
    const reply = await client.send(
      [{ role: 'user', content: 'build done' }],
      event => events.push(event),
    );
    expect(reply).toBe('Want me to tidy the layout?');
    const choiceEvents = events.filter(
      (e): e is Extract<AssistantActivity, { type: 'tool_use' }> => (
        e.type === 'tool_use' && e.name === 'propose_choices'
      ),
    );
    expect(choiceEvents).toHaveLength(1);
    expect(choiceEvents[0]!.input.choices).toEqual(['Yes, tidy it', 'No thanks']);
  } finally {
    localStorage.removeItem('nnvp_anthropic_key');
  }
});
