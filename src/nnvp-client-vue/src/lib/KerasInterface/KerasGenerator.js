// class KerasPythonGenerator {
// This class was adapted from backend Python code.
// It will probably be refactored soon.

/* eslint-disable no-param-reassign */
/* eslint-disable no-continue */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

import KerasGeneratorPythonHelper from './KerasGeneratorPythonHelper';
import KerasGeneratorJavascriptHelper from './KerasGeneratorJavascriptHelper';


export default class KerasGenerator {
  constructor(json, isJavascript) {
    this.json = json;
    this.graph = this.jsonToGraph(json);
    this.inputs = this.findInputs();
    this.outputs = this.findOutputs();
    this.list = this.createTreatmentList();
    this.sequential = this.isSequential();
    // Too bad we can't easily and cleanly heritate those classes from this one while doing mutual
    // inclusion, we'll have to use composition instead
    this.helper = isJavascript
      ? new KerasGeneratorJavascriptHelper(
        this.graph, this.inputs, this.outputs, this.list, this.sequential,
      )
      : new KerasGeneratorPythonHelper(
        this.graph, this.inputs, this.outputs, this.list, this.sequential,
      );
  }

  // Convert a json from the graph editor to a more adapted object
  jsonToGraph(json) {
    const result = {};
    for (const layer of json.layers) { // eslint-disable-line
      this.addLayerToResult(layer, result);
    }
    return result;
  }

  addLayerToResult(layer, result) {
    if (layer.children === null) {
      const nodeId = layer.id;
      if (!Object.prototype.hasOwnProperty.call(result, nodeId)) {
        result[nodeId] = {
          sources: [], targets: [], keras_data: null, d3_data: null, treated: false,
        };
      }
      result[nodeId].d3_data = layer;
      result[nodeId].keras_data = layer.kerasLayer;
      delete result[nodeId].d3_data.kerasLayer;
      result[nodeId].sources = layer.inputLayers;
      result[nodeId].targets = layer.outputLayers;
    } else {
      for (const child of layer.children) { // eslint-disable-line
        this.addLayerToResult(child, result);
      }
    }
  }

  // Return a list of the different inputs
  findInputs() {
    const inputs = [];
    for (const id of this.json.inputs) { // eslint-disable-line
      inputs.push(id);
    }
    return inputs;
  }

  // Return a list of the different outputs
  findOutputs() {
    const outputs = [];
    for (const id of this.json.outputs) { // eslint-disable-line
      outputs.push(id);
    }
    return outputs;
  }

  // Build a treatment array from a graph
  // The array contains the nodes that will be used to generate Python code in the
  // right order so that every input of a Keras layer is already defined.
  createTreatmentList() {
    const list = [];
    // Adds the node and his targets to the array.
    // Adds the node only if all his sources are already added. Otherwise,
    // it waits for another call of this function to add the node. That way,
    // each node is added only once, and the Keras layers will be generated in
    // the correct order.
    const addNodeToList = (node) => {
      for (const s of this.graph[node].sources) { // eslint-disable-line
        if (!this.graph[s].treated) {
          return false;
        }
      }
      list.push(node);
      this.graph[node].treated = true;
      for (const t of this.graph[node].targets) { // eslint-disable-line
        addNodeToList(t);
      }
      return true;
    };
    for (const i of this.findInputs()) { // eslint-disable-line
      addNodeToList(i);
    }
    return list;
  }

  // Return true if we can generate a sequential layer, false otherwise
  isSequential() {
    if (this.inputs.length !== 1) return false;
    if (this.outputs.length !== 1) return false;
    for (const layer of Object.values(this.graph)) { // eslint-disable-line
      if (layer.sources.length !== 1) {
        if (!(layer.keras_data.name === 'Input' && layer.sources.length === 0)) return false;
      }
      if (layer.targets.length !== 1) {
        if (!(layer.keras_data.name === 'Output' && layer.targets.length === 0)) return false;
      }
    }
    return true;
  }

  generateFromGraph() {
    return this.helper.generateFromGraph();
  }

  generatePythonFromGraph() {
    return new KerasGeneratorPythonHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }

  generateJavascriptFromGraph() {
    return new KerasGeneratorJavascriptHelper(
      this.graph, this.inputs, this.outputs, this.list, this.sequential,
    ).generate();
  }
}
