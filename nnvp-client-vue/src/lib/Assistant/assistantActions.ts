// Assistant actions API.
//
// A thin, Vue-decoupled facade over the app's $boardInterface / $kerasInterface so
// the AI assistant can inspect and modify the Keras model through a small set of
// clean, unit-testable functions. Every method is defensive about the graph
// being empty (activeGraph === null) and about unknown layer types / ids so the
// tool-use loop can surface friendly errors instead of throwing opaquely.

import { tutorials } from '../Tutorial/tutorials';
import { concepts, getConcept as getConceptDef } from '../Tutorial/concepts';
import { bus } from '../Events/bus';
import layerHelp from '../KerasInterface/layerHelp';
import categoryHelp from '../KerasInterface/categoryHelp';
import type BoardInterface from '../BoardInterface/BoardInterface';
import type KerasInterface from '../KerasInterface/KerasInterface';
import type { LayerWrapper } from '../FlowInterface/FlowGraphEditor';
import type { KerasLayerJSON, NnvpLayerId, ParameterValue } from '../../types/model';

/**
 * LayerWrapper types `kerasLayer` as its serialized shape, but live boards
 * hold revived KerasLayer instances (see FlowGraphEditor.restore) — this
 * narrow view adds the one method this facade calls on them.
 */
type LiveKerasLayer = KerasLayerJSON & {
  setParameterValue(name: string, value: ParameterValue): void;
};

// The help entries are HTML written for the in-app modal; the assistant wants
// readable text.
function htmlToText(html: string): string {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default class AssistantActions {
  boardInterface: BoardInterface;
  kerasInterface: KerasInterface;

  constructor(boardInterface: BoardInterface, kerasInterface: KerasInterface) {
    this.boardInterface = boardInterface;
    this.kerasInterface = kerasInterface;
  }

  // Internal: throw a friendly error if no graph is ready. Reads then go
  // through the facade's typed getters (getLayers/getEdges/...).
  requireBoard(): BoardInterface {
    const graph = this.boardInterface.activeGraph;
    if (graph === null || graph === undefined || graph.model === undefined) {
      throw new Error('No active graph is available yet.');
    }
    return this.boardInterface;
  }

  // The type name the Keras generators use for a given board layer.
  static layerType(layer: LayerWrapper): string {
    if (layer.kerasLayer && layer.kerasLayer.name) return layer.kerasLayer.name;
    return layer.class || 'Unknown';
  }

  static layerParams(layer: LayerWrapper): Record<string, ParameterValue> {
    if (layer.kerasLayer && layer.kerasLayer.parameterValues) {
      return layer.kerasLayer.parameterValues;
    }
    return {};
  }

  // Available Keras layer type names (from the generated layers JSON).
  listLayerTypes(): string[] {
    return Object.keys(this.kerasInterface.getLayerList());
  }

  // Add a layer of the given type. Mirrors how LayerCatalog/LayerTemplate build
  // the layer: take the catalog's KerasLayer, clone it, hand the clone to
  // $boardInterface.addLayer(...). Returns the created layer's id and type.
  addLayer(typeName: string) {
    if (typeof typeName !== 'string' || typeName.trim() === '') {
      throw new Error('addLayer requires a non-empty layer type name (a string).');
    }
    const catalog = this.kerasInterface.getLayerList();
    const template = catalog[typeName];
    if (template === undefined) {
      const available = Object.keys(catalog).join(', ');
      throw new Error(`Unknown layer type "${typeName}". Available types: ${available}.`);
    }
    const board = this.requireBoard();
    const beforeIds = new Set(board.getLayers().map(layer => layer.id));
    this.boardInterface.addLayer(template.clone());
    const created = board.getLayers().find(layer => !beforeIds.has(layer.id));
    return {
      id: created ? created.id : null,
      type: typeName,
    };
  }

  // Current layers with id, type, name and parameter values.
  listLayers() {
    const board = this.requireBoard();
    return board.getLayers().map(layer => ({
      id: layer.id,
      type: AssistantActions.layerType(layer),
      name: layer.name,
      params: AssistantActions.layerParams(layer),
    }));
  }

  // Set a parameter value on a layer, found by its id.
  setParam(layerId: NnvpLayerId, paramName: string, value: ParameterValue) {
    if (layerId === null || layerId === undefined || layerId === '') {
      throw new Error('setParam requires a layer id (see list_layers for valid ids).');
    }
    if (typeof paramName !== 'string' || paramName.trim() === '') {
      throw new Error('setParam requires a non-empty parameter name (a string).');
    }
    if (value === undefined) {
      throw new Error('setParam requires a value to set.');
    }
    const layer = this.boardInterface.findLayerById(layerId);
    if (layer === null || layer === undefined) {
      throw new Error(`No layer with id "${layerId}".`);
    }
    if (!layer.kerasLayer) {
      throw new Error(`Layer "${layerId}" has no editable parameters.`);
    }
    (layer.kerasLayer as LiveKerasLayer).setParameterValue(paramName, value);
    return {
      id: layerId,
      params: layer.kerasLayer.parameterValues,
    };
  }

  // Counts (layers / inputs / outputs / edges) plus a compact layer list.
  getModelSummary() {
    const board = this.requireBoard();
    return {
      layerCount: board.getLayers().length,
      inputCount: board.getModelInputs().length,
      outputCount: board.getModelOutputs().length,
      edgeCount: board.getEdges().length,
      layers: board.getLayers().map(layer => ({
        id: layer.id,
        type: AssistantActions.layerType(layer),
        name: layer.name,
      })),
    };
  }

  // Generate the Keras model source. Reuses KerasGenerator through the same
  // KerasInterface entry points the File > Generate menu uses.
  generateCode(lang: string): string {
    const graph = this.boardInterface.activeGraph;
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
  requireLayer(layerId: NnvpLayerId, role: string): LayerWrapper {
    const layer = this.boardInterface.findLayerById(layerId);
    if (layer === null || layer === undefined) {
      throw new Error(`No ${role} layer with id "${layerId}" (see list_layers for valid ids).`);
    }
    return layer;
  }

  // Connect two layers (source output -> target input), like dragging an
  // edge on the board. Same rules: self-loops and duplicates refused;
  // cycle-closing edges are allowed (marked red, codegen refuses them).
  connectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId) {
    this.requireLayer(sourceId, 'source');
    this.requireLayer(targetId, 'target');
    const connected = this.boardInterface.connectLayers(sourceId, targetId);
    if (!connected) {
      throw new Error(
        `Cannot connect ${sourceId} -> ${targetId}: the connection already exists `
        + 'or is a self-loop.',
      );
    }
    return { connected: true, source: sourceId, target: targetId };
  }

  // Remove the source -> target connection, if it exists.
  disconnectLayers(sourceId: NnvpLayerId, targetId: NnvpLayerId) {
    this.requireLayer(sourceId, 'source');
    this.requireLayer(targetId, 'target');
    const disconnected = this.boardInterface.disconnectLayers(sourceId, targetId);
    if (!disconnected) {
      throw new Error(`There is no ${sourceId} -> ${targetId} connection to remove.`);
    }
    return { disconnected: true, source: sourceId, target: targetId };
  }

  // Tidy the whole board (layered auto-layout; single undoable step).
  autoLayout() {
    this.boardInterface.autoLayout();
    return { arranged: true };
  }

  deleteSelected() {
    this.boardInterface.deleteSelectedElements();
    return { ok: true };
  }

  undo() {
    this.boardInterface.undo();
    return { ok: true };
  }

  redo() {
    this.boardInterface.redo();
    return { ok: true };
  }

  // Ready-made example networks (the File > Templates menu).
  listTemplates(): string[] {
    const container = this.boardInterface.getTemplatesContainer();
    if (!container || !Array.isArray(container.e)) return [];
    return [...container.e];
  }

  // Load a template onto the board — REPLACES the current graph (mutating).
  loadTemplate(name: string) {
    const available = this.listTemplates();
    if (!available.includes(name)) {
      throw new Error(`Unknown template "${name}". Available templates: ${available.join(', ')}.`);
    }
    this.boardInterface.loadTemplate(name);
    const board = this.requireBoard();
    return { loaded: name, layerCount: board.getLayers().length };
  }

  // The app's guided tutorials: what exists and what each walks through.
  // startTutorial() below actually launches one.
  listTutorials() {
    return tutorials.map(tutorial => ({
      id: tutorial.id,
      title: tutorial.title,
      description: tutorial.description,
      course: tutorial.course ?? null,
      steps: tutorial.steps.map(step => step.title),
    }));
  }

  // The Concepts book: the app's built-in visual theory articles.
  listConcepts() {
    return concepts.map(concept => ({
      id: concept.id,
      title: concept.title,
      part: concept.part,
      hook: concept.hook,
    }));
  }

  // One article as plain text (figures are SVG and don't survive the trip —
  // the description says so, and open_concept shows the real thing).
  getConcept(conceptId: string) {
    const concept = getConceptDef(conceptId);
    if (!concept) {
      const available = concepts.map(entry => entry.id).join(', ');
      throw new Error(`Unknown concept "${conceptId}". Available ids: ${available}.`);
    }
    return {
      id: concept.id,
      title: concept.title,
      part: concept.part,
      text: htmlToText(concept.body),
    };
  }

  // Open the Concepts book at an article in the UI (same event-bridge
  // pattern as startTutorial). Navigation, not a graph mutation.
  openConcept(conceptId: string) {
    const concept = getConceptDef(conceptId);
    if (!concept) {
      const available = concepts.map(entry => entry.id).join(', ');
      throw new Error(`Unknown concept "${conceptId}". Available ids: ${available}.`);
    }
    bus.emit('ui.open-concept', { id: conceptId });
    return { opened: conceptId, title: concept.title };
  }

  // Start (or switch to) a guided tutorial. Tutorial state lives in App.vue,
  // so this bridges over a bus event (same pattern as auth.changed);
  // App listens and drives the overlay. Navigation, not a graph mutation —
  // available even in read-only mode.
  startTutorial(tutorialId: string) {
    const known = tutorials.find(tutorial => tutorial.id === tutorialId);
    if (!known) {
      const available = tutorials.map(tutorial => tutorial.id).join(', ');
      throw new Error(`Unknown tutorial "${tutorialId}". Available ids: ${available}.`);
    }
    bus.emit('ui.start-tutorial', { id: tutorialId });
    return { started: tutorialId, title: known.title };
  }

  // Open the in-browser Training panel (TensorFlow.js). Same event-bridge
  // pattern as startTutorial: App.vue listens and opens the window.
  // Navigation, not a graph mutation — available even in read-only mode.
  openTrainingPanel() {
    bus.emit('ui.open-training');
    return { opened: true };
  }

  // The in-app documentation for a layer type (or a catalog category), as
  // plain text — the same content the (?) buttons show.
  getLayerHelp(name: string): string {
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
