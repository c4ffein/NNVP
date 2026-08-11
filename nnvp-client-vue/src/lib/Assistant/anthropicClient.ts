// Browser-side Anthropic Messages API client with a tool-use loop.
//
// A static NNVP SPA can't hide a key, so this is bring-your-own-key: the API key
// (and an optional custom base URL) live in localStorage and are read at call
// time. Signed-in users get a keyless default instead: with a backend token and
// no key/base-URL of their own, requests go through the NNVP backend proxy,
// which holds the server-side Anthropic key (see readStoredConfig).
// Each AssistantActions method is exposed as a tool; the loop sends the
// conversation, executes any tool_use blocks against the actions, feeds back
// tool_result blocks, and repeats until the model returns a final text answer.

import type AssistantActions from './assistantActions';

// --- Anthropic Messages API shapes (only what this client reads/sends) -------

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Assistant-turn content blocks, as the API returns them. */
export type AnthropicResponseBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** One conversation turn ({ role, content }) in the running history. */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicResponseBlock[] | AnthropicToolResultBlock[];
}

/** The /v1/messages response, as far as the loop reads it. */
interface AnthropicMessagesResponse {
  content: AnthropicResponseBlock[];
}

/** JSON-Schema-ish tool declaration, as the Messages API accepts it. */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** UI feedback events emitted while the tool loop runs (see send()). */
export type AssistantActivity =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; content: string; isError: boolean };

export const STORAGE_KEY = 'nnvp_anthropic_key';
export const STORAGE_BASE_URL = 'nnvp_anthropic_base_url';
export const STORAGE_ALLOW_EDITS = 'nnvp_anthropic_allow_edits';

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_VERSION = '2023-06-01';

// Tools that mutate the model graph. In read-only mode (the default) these are
// blocked by runTool and never touch the model; read-only tools (inspection /
// code generation) always run. Kept as a single source of truth so the UI, the
// tool descriptions and the runtime guard can never drift apart.
export const MUTATING_TOOLS = new Set([
  'auto_layout',
  'connect_layers',
  'disconnect_layers',
  'add_layer',
  'set_param',
  'delete_selected',
  'undo',
  'redo',
  'load_template', // replaces the whole board
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}

// A minimal sanity check for an Anthropic API key. We deliberately keep this
// permissive (custom proxies may issue their own keys) but catch obvious
// mistakes like empty strings or a pasted placeholder.
export function isPlausibleApiKey(key: unknown): boolean {
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
  'The app ships ready-made templates (list_templates / load_template) and guided',
  'tutorials (list_tutorials) — suggest them before building common networks from',
  'scratch, and use get_layer_help to explain layers with the app\'s own docs.',
  'The model CAN be trained right here in the browser: the Training panel runs',
  'it with TensorFlow.js on built-in datasets (MNIST, FashionMNIST, CIFAR-10),',
  'with optimizer/loss/epochs options and live charts. When the user asks to run',
  'or train the model, open the panel with open_training_panel and walk them',
  'through it (pick a dataset, then Train) — never claim training needs an',
  'external Python setup, though generate_code exists for exporting.',
  'When your question has a few natural answers, call propose_choices so the',
  'user can tap one. After building or rewiring a multi-layer network, offer',
  'auto_layout (ask first, e.g. via propose_choices) — it tidies the board in',
  'one undoable step.',
].join(' ');

// Tool surface: one entry per AssistantActions method the model may call.
// buildTools() returns the array sent to the API; TOOL_DISPATCH maps each tool
// name to how it invokes the actions instance.
export function buildTools(): AnthropicTool[] {
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
      name: 'connect_layers',
      description: '[Modifies the model] Connect two layers (data flows source -> target), like dragging an edge on the board. Self-loops and duplicates are refused; a connection that closes a cycle is allowed but the model cannot generate code until the loop is removed.',
      input_schema: {
        type: 'object',
        properties: {
          source_id: { description: 'Layer id the connection starts from (see list_layers).' },
          target_id: { description: 'Layer id the connection goes to.' },
        },
        required: ['source_id', 'target_id'],
      },
    },
    {
      name: 'disconnect_layers',
      description: '[Modifies the model] Remove the source -> target connection between two layers.',
      input_schema: {
        type: 'object',
        properties: {
          source_id: { description: 'Layer id the existing connection starts from.' },
          target_id: { description: 'Layer id the existing connection goes to.' },
        },
        required: ['source_id', 'target_id'],
      },
    },
    {
      name: 'auto_layout',
      description: '[Modifies the model] Rearrange ALL layers into a tidy layered layout (undoable in one step). Ask the user before running it unless they asked for tidying.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'propose_choices',
      description: 'Offer the user a small set of tappable answers to your question (rendered as buttons under the chat). Use whenever your question has a few natural answers — e.g. after building a network: ["Yes, tidy the layout", "No thanks"].',
      input_schema: {
        type: 'object',
        properties: {
          choices: {
            type: 'array',
            items: { type: 'string' },
            description: '2 to 4 short answers, each under ~40 characters.',
          },
        },
        required: ['choices'],
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
    {
      name: 'list_templates',
      description: 'List the ready-made example networks (templates) that can be loaded.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'load_template',
      description: '[Modifies the model] Load a template onto the board, REPLACING the current graph. Prefer suggesting this over building common networks layer by layer.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A template name from list_templates.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'list_tutorials',
      description: "List the app's guided tutorials (id, title, description, step titles). Start or switch to one with start_tutorial.",
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'start_tutorial',
      description: 'Start (or switch to) a guided tutorial: opens the step-by-step overlay in the app. Navigation only — works in read-only mode.',
      input_schema: {
        type: 'object',
        properties: {
          tutorial_id: { type: 'string', description: 'A tutorial id from list_tutorials.' },
        },
        required: ['tutorial_id'],
      },
    },
    {
      name: 'list_concepts',
      description: "List the Concepts book's articles (id, title, part, hook) — the app's built-in visual theory book on how neural networks work. Read one with get_concept; show one to the user with open_concept.",
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_concept',
      description: 'One Concepts-book article as plain text (its SVG figures are omitted — use open_concept to show the user the real, illustrated page).',
      input_schema: {
        type: 'object',
        properties: {
          concept_id: { type: 'string', description: 'A concept id from list_concepts.' },
        },
        required: ['concept_id'],
      },
    },
    {
      name: 'open_concept',
      description: 'Open the Concepts book at an article in the app, illustrations and all. Navigation only — works in read-only mode.',
      input_schema: {
        type: 'object',
        properties: {
          concept_id: { type: 'string', description: 'A concept id from list_concepts.' },
        },
        required: ['concept_id'],
      },
    },
    {
      name: 'open_training_panel',
      description: 'Open the in-browser Training panel (TensorFlow.js): dataset picker (MNIST, FashionMNIST, CIFAR-10), compile options and live charts. Navigation only — works in read-only mode.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_layer_help',
      description: "The app's own documentation for a layer type or catalog category, as plain text (the same content the (?) buttons show). Prefer this over memory when explaining layers.",
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A layer type from list_layer_types, or a catalog category name.' },
        },
        required: ['name'],
      },
    },
  ];
}

// Tool inputs come from the model, so they are dynamic by nature; every
// handler's action validates its arguments at runtime and throws the friendly
// errors runTool feeds back to the model.
type ToolHandler = (actions: AssistantActions, input: Record<string, any>) => unknown;

const TOOL_DISPATCH: Record<string, ToolHandler> = {
  list_layer_types: (actions) => actions.listLayerTypes(),
  add_layer: (actions, input) => actions.addLayer(input.type_name),
  list_layers: (actions) => actions.listLayers(),
  set_param: (actions, input) => actions.setParam(input.layer_id, input.param_name, input.value),
  get_model_summary: (actions) => actions.getModelSummary(),
  generate_code: (actions, input) => actions.generateCode(input.lang),
  connect_layers: (actions, input) => actions.connectLayers(input.source_id, input.target_id),
  disconnect_layers: (actions, input) => actions.disconnectLayers(input.source_id, input.target_id),
  auto_layout: (actions) => actions.autoLayout(),
  // UI-level: the chat surfaces the buttons via onActivity; the model just
  // needs an acknowledgment.
  propose_choices: () => ({ shown: true }),
  delete_selected: (actions) => actions.deleteSelected(),
  undo: (actions) => actions.undo(),
  redo: (actions) => actions.redo(),
  list_templates: (actions) => actions.listTemplates(),
  load_template: (actions, input) => actions.loadTemplate(input.name),
  list_tutorials: (actions) => actions.listTutorials(),
  start_tutorial: (actions, input) => actions.startTutorial(input.tutorial_id),
  list_concepts: (actions) => actions.listConcepts(),
  get_concept: (actions, input) => actions.getConcept(input.concept_id),
  open_concept: (actions, input) => actions.openConcept(input.concept_id),
  open_training_panel: (actions) => actions.openTrainingPanel(),
  get_layer_help: (actions, input) => actions.getLayerHelp(input.name),
};

// The NNVP backend is same-origin at /api (never user-configured; see
// lib/Backend/apiClient.js).
const BACKEND_BASE_URL = '/api';

/** Config overrides accepted by readStoredConfig / the client options. */
export interface AssistantConfigOverrides {
  apiKey?: string;
  baseUrl?: string;
  backendUrl?: string;
  backendToken?: string;
}

export interface AssistantConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  backendUrl: string;
  backendToken: string;
}

// Read config from localStorage when available, letting explicit options win.
//
// Base-URL resolution (precedence, highest first):
//   1. an explicit base URL (override or stored setting) is used verbatim;
//   2. otherwise, a signed-in user (backend token present) who has NOT set an
//      Anthropic API key of their own defaults to the NNVP backend proxy, so
//      signing in is enough — no key required;
//   3. otherwise, the public Anthropic API (bring-your-own-key).
export function readStoredConfig(overrides: AssistantConfigOverrides = {}): AssistantConfig {
  let stored: { apiKey?: string; baseUrl?: string; backendToken?: string } = {};
  if (typeof localStorage !== 'undefined') {
    stored = {
      apiKey: localStorage.getItem(STORAGE_KEY) || '',
      baseUrl: localStorage.getItem(STORAGE_BASE_URL) || '',
      backendToken: localStorage.getItem('nnvp_backend_token') || '',
    };
  }
  const apiKey = overrides.apiKey || stored.apiKey || '';
  const explicitBaseUrl = overrides.baseUrl || stored.baseUrl || '';
  const backendUrl = overrides.backendUrl || BACKEND_BASE_URL;
  const backendToken = overrides.backendToken || stored.backendToken || '';
  const baseUrl = explicitBaseUrl
    || (backendToken && !apiKey ? backendUrl : DEFAULT_BASE_URL);
  return {
    apiKey,
    baseUrl,
    // The model is pinned: no user override (the backend enforces its own
    // pin too — see nnvp-backend core/api/assistant.py).
    model: DEFAULT_MODEL,
    backendUrl,
    backendToken,
  };
}

const trimSlash = (url: string) => (url || '').replace(/\/+$/, '');

// The NNVP backend exposes the assistant proxy at /api/assistant/messages with
// Bearer-token auth and a server-side Anthropic key — a different path and
// auth scheme from api.anthropic.com. When the chat's base URL is set to the
// same-origin backend ("/api"), switch to that contract; any other custom base
// URL is treated as a transparent Anthropic-compatible proxy (same
// /v1/messages + x-api-key).
export function usesBackendProxy(config: AssistantConfig): boolean {
  return Boolean(config.backendUrl)
    && trimSlash(config.baseUrl) === trimSlash(config.backendUrl);
}

export interface AnthropicClientOptions extends AssistantConfigOverrides {
  /** Allow tests to inject a fetch implementation. */
  fetch?: typeof fetch;
  maxTurns?: number;
  maxTokens?: number;
  allowEdits?: boolean;
}

export type ActivityListener = (activity: AssistantActivity) => void;

export default class AnthropicClient {
  actions: AssistantActions;
  options: AnthropicClientOptions;
  fetchImpl: typeof fetch | null;
  maxTurns: number;
  allowEdits: boolean;

  constructor(actions: AssistantActions, options: AnthropicClientOptions = {}) {
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
  setAllowEdits(value: boolean) {
    this.allowEdits = Boolean(value);
  }

  config(): AssistantConfig {
    return readStoredConfig(this.options);
  }

  hasApiKey(): boolean {
    return Boolean(this.config().apiKey);
  }

  // The tools array sent to the API, one per exposed action.
  tools(): AnthropicTool[] {
    return buildTools();
  }

  // Execute a single tool call against the actions, returning the JSON-string
  // content and an is_error flag for the tool_result block.
  runTool(name: string, input: Record<string, unknown> | undefined): { content: string; isError: boolean } {
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
      const message = (error as { message?: string }).message;
      return { content: message || String(error), isError: true };
    }
  }

  // Turn a non-2xx HTTP response into a friendly, actionable message. Tries to
  // pull `error.message` out of the JSON body, falling back to the raw text.
  // `viaBackend` switches to NNVP-backend-proxy wording: there the user has no
  // API key or base URL to fix, so the advice is about their account instead.
  static async describeHttpError(response: Response, viaBackend = false): Promise<string> {
    let detail = '';
    try {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } } | null;
        detail = (parsed && parsed.error && parsed.error.message) ? parsed.error.message : body;
      } catch {
        detail = body;
      }
    } catch { /* ignore unreadable bodies */ }
    if (viaBackend) {
      // Backend proxy statuses. When the credit system lands, a 402 entry
      // ("You are out of assistant credits…") belongs in this map.
      const backendKnown: Record<number, string> = {
        401: 'Your NNVP session has expired or is not verified (401). '
          + 'Sign in again (Account menu) to use the assistant.',
        429: 'Rate limited (429). Try again in a bit.',
      };
      const base = backendKnown[response.status]
        || (response.status >= 500
          ? `The NNVP backend had a problem (${response.status}). Try again shortly.`
          : `NNVP backend error (status ${response.status}).`);
      return detail ? `${base} ${detail}` : base;
    }
    const known: Record<number, string> = {
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

  async postMessages(messages: AnthropicMessage[]): Promise<AnthropicMessagesResponse> {
    const config = this.config();
    const { apiKey, baseUrl, model } = config;
    const viaBackend = usesBackendProxy(config);
    if (viaBackend) {
      if (!config.backendToken) {
        throw new Error('Sign in to your NNVP account to use the backend assistant proxy (Account menu).');
      }
    } else {
      if (!apiKey) {
        throw new Error(
          'No Anthropic API key set. Add one in the assistant settings (⚙), '
          + 'or sign in (Account menu) to use the assistant without an API key.',
        );
      }
      if (!isPlausibleApiKey(apiKey)) {
        throw new Error('The Anthropic API key looks malformed. Check it in the settings (⚙).');
      }
    }
    if (!this.fetchImpl) {
      throw new Error('No network client is available in this environment.');
    }
    // Backend proxy: backendUrl is the API root (Django mounts everything
    // under /api), so the route is `${backendUrl}/assistant/messages` —
    // NOT `${backendUrl}/api/assistant/messages`.
    const endpoint = viaBackend
      ? `${trimSlash(config.backendUrl)}/assistant/messages`
      : `${baseUrl}/v1/messages`;
    const headers: Record<string, string> = viaBackend
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
    let response: Response;
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
      const err = error as { message?: string } | null;
      throw new Error(viaBackend
        ? 'Could not reach the NNVP backend '
          + `(${(err && err.message) || error}). Check your connection and try again.`
        : 'Network error: could not reach the Anthropic API '
          + `(${(err && err.message) || error}). Check your connection or the base URL.`);
    }
    if (!response.ok) {
      throw new Error(await AnthropicClient.describeHttpError(response, viaBackend));
    }
    let data: AnthropicMessagesResponse;
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
  async send(history: AnthropicMessage[], onActivity?: ActivityListener): Promise<string> {
    const notify = onActivity || (() => {});
    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const reply = await this.postMessages(history);
      if (!reply || !Array.isArray(reply.content)) {
        throw new Error('The Anthropic API returned an unexpected response shape (no content).');
      }
      history.push({ role: 'assistant', content: reply.content });

      const toolUses = reply.content.filter(
        (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
      );
      const texts = reply.content
        .filter((block): block is AnthropicTextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      if (toolUses.length === 0) {
        return texts;
      }
      if (texts) notify({ type: 'text', text: texts });

      const toolResults = toolUses.map((block): AnthropicToolResultBlock => {
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
