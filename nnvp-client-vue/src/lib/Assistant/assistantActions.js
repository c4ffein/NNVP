// Assistant actions API.
//
// A thin, Vue-decoupled facade over the app's $d3Interface / $kerasInterface so
// the AI assistant can inspect and modify the Keras model through a small set of
// clean, unit-testable functions. Every method is defensive about the graph
// being empty (activeGraph === null) and about unknown layer types / ids so the
// tool-use loop can surface friendly errors instead of throwing opaquely.

import { tutorials } from '../Tutorial/tutorials';
import layerHelp from '../KerasInterface/layerHelp';
import categoryHelp from '../KerasInterface/categoryHelp';

// The help entries are HTML written for the in-app modal; the assistant wants
// readable text.
function htmlToText(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default class AssistantActions {
  constructor(d3Interface, kerasInterface) {
    this.d3Interface = d3Interface;
    this.kerasInterface = kerasInterface;
  }

  // Internal: the active D3Model, or throw a friendly error if no graph is ready.
  requireModel() {
    const graph = this.d3Interface.activeGraph;
    if (graph === null || graph === undefined || graph.model === undefined) {
      throw new Error('No active graph is available yet.');
    }
    return graph.model;
  }

  // The type name the Keras generators use for a given d3 layer.
  static layerType(layer) {
    if (layer.kerasLayer && layer.kerasLayer.name) return layer.kerasLayer.name;
    return layer.class || 'Unknown';
  }

  static layerParams(layer) {
    if (layer.kerasLayer && layer.kerasLayer.parameterValues) {
      return layer.kerasLayer.parameterValues;
    }
    return {};
  }

  // Available Keras layer type names (from the generated layers JSON).
  listLayerTypes() {
    return Object.keys(this.kerasInterface.getLayerList());
  }

  // Add a layer of the given type. Mirrors how LayerCatalog/LayerTemplate build
  // the layer: take the catalog's KerasLayer, clone it, hand the clone to
  // $d3Interface.addLayer(...). Returns the created layer's id and type.
  addLayer(typeName) {
    if (typeof typeName !== 'string' || typeName.trim() === '') {
      throw new Error('addLayer requires a non-empty layer type name (a string).');
    }
    const catalog = this.kerasInterface.getLayerList();
    const template = catalog[typeName];
    if (template === undefined) {
      const available = Object.keys(catalog).join(', ');
      throw new Error(`Unknown layer type "${typeName}". Available types: ${available}.`);
    }
    const model = this.requireModel();
    const beforeIds = new Set(model.d3Layers.map(layer => layer.id));
    this.d3Interface.addLayer(template.clone());
    const created = model.d3Layers.find(layer => !beforeIds.has(layer.id));
    return {
      id: created ? created.id : null,
      type: typeName,
    };
  }

  // Current layers with id, type, name and parameter values.
  listLayers() {
    const model = this.requireModel();
    return model.d3Layers.map(layer => ({
      id: layer.id,
      type: AssistantActions.layerType(layer),
      name: layer.name,
      params: AssistantActions.layerParams(layer),
    }));
  }

  // Set a parameter value on a layer, found by its id.
  setParam(layerId, paramName, value) {
    if (layerId === null || layerId === undefined || layerId === '') {
      throw new Error('setParam requires a layer id (see list_layers for valid ids).');
    }
    if (typeof paramName !== 'string' || paramName.trim() === '') {
      throw new Error('setParam requires a non-empty parameter name (a string).');
    }
    if (value === undefined) {
      throw new Error('setParam requires a value to set.');
    }
    const layer = this.d3Interface.findLayerById(layerId);
    if (layer === null || layer === undefined) {
      throw new Error(`No layer with id "${layerId}".`);
    }
    if (!layer.kerasLayer) {
      throw new Error(`Layer "${layerId}" has no editable parameters.`);
    }
    layer.kerasLayer.setParameterValue(paramName, value);
    return {
      id: layerId,
      params: layer.kerasLayer.parameterValues,
    };
  }

  // Counts (layers / inputs / outputs / edges) plus a compact layer list.
  getModelSummary() {
    const model = this.requireModel();
    return {
      layerCount: model.d3Layers.length,
      inputCount: model.modelInputs.length,
      outputCount: model.modelOutputs.length,
      edgeCount: model.d3Edges.length,
      layers: model.d3Layers.map(layer => ({
        id: layer.id,
        type: AssistantActions.layerType(layer),
        name: layer.name,
      })),
    };
  }

  // Generate the Keras model source. Reuses KerasGenerator through the same
  // KerasInterface entry points the File > Generate menu uses.
  generateCode(lang) {
    const graph = this.d3Interface.activeGraph;
    if (graph === null || graph === undefined) {
      throw new Error('No active graph is available yet.');
    }
    const graphJson = graph.toJSON();
    if (lang === 'python') {
      return this.kerasInterface.generatePython(graphJson);
    }
    if (lang === 'javascript') {
      return this.kerasInterface.generateJavascript(graphJson);
    }
    throw new Error(`Unknown language "${lang}" (expected "python" or "javascript").`);
  }

  // Internal: both edge tools need existing layer ids and friendly errors.
  requireLayer(layerId, role) {
    const layer = this.d3Interface.findLayerById(layerId);
    if (layer === null || layer === undefined) {
      throw new Error(`No ${role} layer with id "${layerId}" (see list_layers for valid ids).`);
    }
    return layer;
  }

  // Connect two layers (source output -> target input), like dragging an
  // edge on the board. Same rules: self-loops, duplicates and cycles refused.
  connectLayers(sourceId, targetId) {
    this.requireLayer(sourceId, 'source');
    this.requireLayer(targetId, 'target');
    const connected = this.d3Interface.connectLayers(sourceId, targetId);
    if (!connected) {
      throw new Error(
        `Cannot connect ${sourceId} -> ${targetId}: the connection already exists, `
        + 'is a self-loop, or would create a cycle.',
      );
    }
    return { connected: true, source: sourceId, target: targetId };
  }

  // Remove the source -> target connection, if it exists.
  disconnectLayers(sourceId, targetId) {
    this.requireLayer(sourceId, 'source');
    this.requireLayer(targetId, 'target');
    const disconnected = this.d3Interface.disconnectLayers(sourceId, targetId);
    if (!disconnected) {
      throw new Error(`There is no ${sourceId} -> ${targetId} connection to remove.`);
    }
    return { disconnected: true, source: sourceId, target: targetId };
  }

  deleteSelected() {
    this.d3Interface.deleteSelectedElements();
    return { ok: true };
  }

  undo() {
    this.d3Interface.undo();
    return { ok: true };
  }

  redo() {
    this.d3Interface.redo();
    return { ok: true };
  }

  // Ready-made example networks (the File > Templates menu).
  listTemplates() {
    const container = this.d3Interface.getTemplatesContainer();
    if (!container || !Array.isArray(container.e)) return [];
    return [...container.e];
  }

  // Load a template onto the board — REPLACES the current graph (mutating).
  loadTemplate(name) {
    const available = this.listTemplates();
    if (!available.includes(name)) {
      throw new Error(`Unknown template "${name}". Available templates: ${available.join(', ')}.`);
    }
    this.d3Interface.loadTemplate(name);
    const model = this.requireModel();
    return { loaded: name, layerCount: model.d3Layers.length };
  }

  // The app's guided tutorials: what exists and what each walks through.
  // startTutorial() below actually launches one.
  listTutorials() {
    return tutorials.map(tutorial => ({
      id: tutorial.id,
      title: tutorial.title,
      description: tutorial.description,
      steps: tutorial.steps.map(step => step.title),
    }));
  }

  // Start (or switch to) a guided tutorial. Tutorial state lives in App.vue,
  // so this bridges over a window event (same pattern as nnvp:auth-changed);
  // App listens and drives the overlay. Navigation, not a graph mutation —
  // available even in read-only mode.
  startTutorial(tutorialId) {
    const known = tutorials.find(tutorial => tutorial.id === tutorialId);
    if (!known) {
      const available = tutorials.map(tutorial => tutorial.id).join(', ');
      throw new Error(`Unknown tutorial "${tutorialId}". Available ids: ${available}.`);
    }
    window.dispatchEvent(new CustomEvent('nnvp:start-tutorial', { detail: { id: tutorialId } }));
    return { started: tutorialId, title: known.title };
  }

  // Open the in-browser Training panel (TensorFlow.js). Same event-bridge
  // pattern as startTutorial: App.vue listens and opens the window.
  // Navigation, not a graph mutation — available even in read-only mode.
  openTrainingPanel() {
    window.dispatchEvent(new CustomEvent('nnvp:open-training'));
    return { opened: true };
  }

  // The in-app documentation for a layer type (or a catalog category), as
  // plain text — the same content the (?) buttons show.
  getLayerHelp(name) {
    const entry = layerHelp[name] || categoryHelp[name];
    if (entry === undefined) {
      throw new Error(
        `No help entry for "${name}". Use a layer type from list_layer_types `
        + 'or a catalog category name.',
      );
    }
    return htmlToText(entry);
  }
}
