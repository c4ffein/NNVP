// Browser-side Anthropic Messages API client with a tool-use loop.
//
// A static NNVP SPA can't hide a key, so this is bring-your-own-key: the API key
// (and an optional custom base URL) live in localStorage and are read at call
// time. Each AssistantActions method is exposed as a tool; the loop sends the
// conversation, executes any tool_use blocks against the actions, feeds back
// tool_result blocks, and repeats until the model returns a final text answer.

export const STORAGE_KEY = 'nnvp_anthropic_key';
export const STORAGE_BASE_URL = 'nnvp_anthropic_base_url';
export const STORAGE_MODEL = 'nnvp_anthropic_model';
export const STORAGE_ALLOW_EDITS = 'nnvp_anthropic_allow_edits';

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

// Tools that mutate the model graph. In read-only mode (the default) these are
// blocked by runTool and never touch the model; read-only tools (inspection /
// code generation) always run. Kept as a single source of truth so the UI, the
// tool descriptions and the runtime guard can never drift apart.
export const MUTATING_TOOLS = new Set([
  'add_layer',
  'set_param',
  'delete_selected',
  'undo',
  'redo',
]);

export function isMutatingTool(name) {
  return MUTATING_TOOLS.has(name);
}

// A minimal sanity check for an Anthropic API key. We deliberately keep this
// permissive (custom proxies may issue their own keys) but catch obvious
// mistakes like empty strings or a pasted placeholder.
export function isPlausibleApiKey(key) {
  return typeof key === 'string' && key.trim().length >= 8;
}

export const SYSTEM_PROMPT = [
  'You are the NNVP assistant, embedded in a visual editor that builds Keras models.',
  'You can inspect and modify the model graph through the provided tools.',
  'Tools marked "[Modifies the model]" change the graph; the others are read-only.',
  'The user may run you in read-only mode, in which the modifying tools are',
  'disabled and will return an error — if that happens, do not keep retrying them:',
  'explain what you would change and suggest the user enable "Allow edits".',
  'Prefer calling a tool over guessing. When you add layers or change parameters,',
  'briefly confirm what you did. Keep answers concise.',
].join(' ');

// Tool surface: one entry per AssistantActions method the model may call.
// buildTools() returns the array sent to the API; TOOL_DISPATCH maps each tool
// name to how it invokes the actions instance.
export function buildTools() {
  return [
    {
      name: 'list_layer_types',
      description: 'List every available Keras layer type name that can be added.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'add_layer',
      description: '[Modifies the model] Add a new layer of the given type to the model graph.',
      input_schema: {
        type: 'object',
        properties: {
          type_name: { type: 'string', description: 'A layer type from list_layer_types.' },
        },
        required: ['type_name'],
      },
    },
    {
      name: 'list_layers',
      description: 'List the current layers with their id, type, name and parameter values.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'set_param',
      description: '[Modifies the model] Set a parameter value on a layer, identified by its id.',
      input_schema: {
        type: 'object',
        properties: {
          layer_id: { description: 'The id of the layer to modify.' },
          param_name: { type: 'string', description: 'The parameter name.' },
          value: { description: 'The new parameter value (any JSON value).' },
        },
        required: ['layer_id', 'param_name', 'value'],
      },
    },
    {
      name: 'get_model_summary',
      description: 'Get counts of layers/inputs/outputs/edges plus a compact layer list.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'generate_code',
      description: 'Generate the Keras model source code and return it as a string.',
      input_schema: {
        type: 'object',
        properties: {
          lang: { type: 'string', enum: ['python', 'javascript'] },
        },
        required: ['lang'],
      },
    },
    {
      name: 'delete_selected',
      description: '[Modifies the model] Delete the currently selected layers/edges from the graph.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'undo',
      description: '[Modifies the model] Undo the last graph change.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'redo',
      description: '[Modifies the model] Redo the last undone graph change.',
      input_schema: { type: 'object', properties: {} },
    },
  ];
}

const TOOL_DISPATCH = {
  list_layer_types: (actions) => actions.listLayerTypes(),
  add_layer: (actions, input) => actions.addLayer(input.type_name),
  list_layers: (actions) => actions.listLayers(),
  set_param: (actions, input) => actions.setParam(input.layer_id, input.param_name, input.value),
  get_model_summary: (actions) => actions.getModelSummary(),
  generate_code: (actions, input) => actions.generateCode(input.lang),
  delete_selected: (actions) => actions.deleteSelected(),
  undo: (actions) => actions.undo(),
  redo: (actions) => actions.redo(),
};

// Read config from localStorage when available, letting explicit options win.
export function readStoredConfig(overrides = {}) {
  let stored = {};
  if (typeof localStorage !== 'undefined') {
    stored = {
      apiKey: localStorage.getItem(STORAGE_KEY) || '',
      baseUrl: localStorage.getItem(STORAGE_BASE_URL) || '',
      model: localStorage.getItem(STORAGE_MODEL) || '',
      backendUrl: localStorage.getItem('nnvp_backend_url') || '',
      backendToken: localStorage.getItem('nnvp_backend_token') || '',
    };
  }
  return {
    apiKey: overrides.apiKey || stored.apiKey || '',
    baseUrl: overrides.baseUrl || stored.baseUrl || DEFAULT_BASE_URL,
    model: overrides.model || stored.model || DEFAULT_MODEL,
    backendUrl: overrides.backendUrl || stored.backendUrl || '',
    backendToken: overrides.backendToken || stored.backendToken || '',
  };
}

const trimSlash = (url) => (url || '').replace(/\/+$/, '');

// The NNVP backend exposes the assistant proxy at /api/assistant/messages with
// JWT Bearer auth and a server-side Anthropic key — a different path and auth
// scheme from api.anthropic.com. When the chat's base URL is the configured
// NNVP backend, switch to that contract; any other custom base URL is treated
// as a transparent Anthropic-compatible proxy (same /v1/messages + x-api-key).
export function usesBackendProxy(config) {
  return Boolean(config.backendUrl)
    && trimSlash(config.baseUrl) === trimSlash(config.backendUrl);
}

export default class AnthropicClient {
  constructor(actions, options = {}) {
    this.actions = actions;
    this.options = options;
    // Allow tests to inject a fetch implementation.
    this.fetchImpl = options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.maxTurns = options.maxTurns || 12;
    // Guardrail: mutating tools only run when edits are explicitly allowed.
    // Defaults to read-only so the assistant can never modify the model until
    // the user opts in through the UI.
    this.allowEdits = Boolean(options.allowEdits);
  }

  // Toggle the read-only vs allowed-to-edit guardrail at runtime (the UI calls
  // this when the user flips the mode control).
  setAllowEdits(value) {
    this.allowEdits = Boolean(value);
  }

  config() {
    return readStoredConfig(this.options);
  }

  hasApiKey() {
    return Boolean(this.config().apiKey);
  }

  // The tools array sent to the API, one per exposed action.
  tools() {
    return buildTools();
  }

  // Execute a single tool call against the actions, returning the JSON-string
  // content and an is_error flag for the tool_result block.
  runTool(name, input) {
    const handler = TOOL_DISPATCH[name];
    if (handler === undefined) {
      return { content: `Unknown tool "${name}".`, isError: true };
    }
    if (isMutatingTool(name) && !this.allowEdits) {
      return {
        content: `Read-only mode is on, so "${name}" (which modifies the model) is disabled. `
          + 'Do not retry it. Ask the user to turn on "Allow edits", or use the read-only '
          + 'tools instead (list_layers, list_layer_types, get_model_summary, generate_code).',
        isError: true,
      };
    }
    try {
      const result = handler(this.actions, input || {});
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      return { content, isError: false };
    } catch (error) {
      return { content: error.message || String(error), isError: true };
    }
  }

  // Turn a non-2xx HTTP response into a friendly, actionable message. Tries to
  // pull `error.message` out of the JSON body, falling back to the raw text.
  static async describeHttpError(response) {
    let detail = '';
    try {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body);
        detail = (parsed && parsed.error && parsed.error.message) ? parsed.error.message : body;
      } catch {
        detail = body;
      }
    } catch { /* ignore unreadable bodies */ }
    const known = {
      400: 'The request was rejected (400 Bad Request).',
      401: 'Invalid API key (401). Check the key in the assistant settings (⚙).',
      403: 'Access forbidden (403). This key may not be allowed to use the API.',
      404: 'Endpoint not found (404). Check the base URL in the assistant settings.',
      413: 'The conversation is too large to send (413). Start a new chat.',
      429: 'Rate limited (429). Please wait a moment and try again.',
      500: 'The Anthropic API had an internal error (500). Try again shortly.',
      503: 'The Anthropic API is unavailable (503). Try again shortly.',
      529: 'The Anthropic API is overloaded (529). Try again shortly.',
    };
    const base = known[response.status] || `Anthropic API error (status ${response.status}).`;
    return detail ? `${base} ${detail}` : base;
  }

  async postMessages(messages) {
    const config = this.config();
    const { apiKey, baseUrl, model } = config;
    const viaBackend = usesBackendProxy(config);
    if (viaBackend) {
      if (!config.backendToken) {
        throw new Error('Sign in to your NNVP account to use the backend assistant proxy (Account menu).');
      }
    } else {
      if (!apiKey) {
        throw new Error('No Anthropic API key set. Add one in the assistant settings (⚙).');
      }
      if (!isPlausibleApiKey(apiKey)) {
        throw new Error('The Anthropic API key looks malformed. Check it in the settings (⚙).');
      }
    }
    if (!this.fetchImpl) {
      throw new Error('No network client is available in this environment.');
    }
    const endpoint = viaBackend
      ? `${trimSlash(baseUrl)}/api/assistant/messages`
      : `${baseUrl}/v1/messages`;
    const headers = viaBackend
      ? {
        authorization: `Bearer ${config.backendToken}`,
        'content-type': 'application/json',
      }
      : {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      };
    let response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: this.options.maxTokens || 2048,
          system: SYSTEM_PROMPT,
          messages,
          tools: this.tools(),
        }),
      });
    } catch (error) {
      throw new Error(
        'Network error: could not reach the Anthropic API '
        + `(${(error && error.message) || error}). Check your connection or the base URL.`,
      );
    }
    if (!response.ok) {
      throw new Error(await AnthropicClient.describeHttpError(response));
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('The Anthropic API returned a malformed (non-JSON) response.');
    }
    return data;
  }

  // Run the tool-use loop for one user turn. `history` is the running list of
  // Anthropic messages; it is mutated in place with the new turns. `onActivity`
  // (optional) is called with { type, ... } as tools run, for UI feedback.
  // Returns the final assistant text.
  async send(history, onActivity) {
    const notify = onActivity || (() => {});
    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const reply = await this.postMessages(history);
      if (!reply || !Array.isArray(reply.content)) {
        throw new Error('The Anthropic API returned an unexpected response shape (no content).');
      }
      history.push({ role: 'assistant', content: reply.content });

      const toolUses = reply.content.filter(block => block.type === 'tool_use');
      const texts = reply.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      if (toolUses.length === 0) {
        return texts;
      }
      if (texts) notify({ type: 'text', text: texts });

      const toolResults = toolUses.map(block => {
        notify({ type: 'tool_use', name: block.name, input: block.input });
        const { content, isError } = this.runTool(block.name, block.input);
        notify({ type: 'tool_result', name: block.name, content, isError });
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content,
          is_error: isError,
        };
      });
      history.push({ role: 'user', content: toolResults });
    }
    throw new Error(
      `The assistant used tools ${this.maxTurns} times without finishing. `
      + 'Stopping to avoid a loop — try rephrasing your request.',
    );
  }
}
