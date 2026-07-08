// Assistant actions API.
//
// A thin, Vue-decoupled facade over the app's $d3Interface / $kerasInterface so
// the AI assistant can inspect and modify the Keras model through a small set of
// clean, unit-testable functions. Every method is defensive about the graph
// being empty (activeGraph === null) and about unknown layer types / ids so the
// tool-use loop can surface friendly errors instead of throwing opaquely.

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
}
