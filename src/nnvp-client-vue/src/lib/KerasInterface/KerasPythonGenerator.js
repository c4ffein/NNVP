// class KerasPythonGenerator {
// This class was adapted from backend Python code.
// It will probably be refactored soon.

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

export default class {
  constructor(json) {
    this.json = json;
    this.graph = this.jsonToGraph(json);
  }

  // Convert a json from the graph editor to a more adapted object
  jsonToGraph(json) {
    const result = {};
    for (const layer of json.layers) { // eslint-disable-line
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
    }
    return result;
  }

  // Returns the name given to the node in the generated Python code
  nodeName(node) {
    if (this.graph[node].keras_data.name === 'Input') {
      return `input_${node}`;
    }
    if (this.graph[node].keras_data.name === 'Output') {
      return `output_${node}`;
    }

    return `layer_${node}`;
  }

  generateTuple(param) {
    let tupleString = '(';
    for (let i = 0; i < param.length; i += 1) {
      const value = param[i];
      if (typeof (value) === 'string') {
        tupleString += `'${value}',`;
      } else if (Array.isArray(value)) {
        tupleString += `${this.generateTuple(value)},`;
      } else {
        tupleString += `${value},`;
      }
    }
    tupleString += ')';
    return tupleString;
  }

  // Return a string containing Python instructions to add the node.
  // Options are set to defaults for now, only 3 layer types are used.
  generatePythonFromNode(node) {
    let rs = `${this.nodeName(node)} = `;
    if (this.graph[node].keras_data.name === 'Output') {
      return '';
    }

    rs += 'keras.layers.';
    rs += this.graph[node].keras_data.name;
    rs += '(';
    let paramString = '';
    // TODO : use parametersDef?
    // eslint-disable-next-line
    for (const [param, value] of Object.entries(this.graph[node].keras_data.parameterValues)) {
      if (typeof value === 'string') {
        paramString += `${param}='${value}',`;
      } else if (Array.isArray(value)) {
        paramString += `${param}=${this.generateTuple(value)},`;
      } else if (typeof value === 'boolean') {
        paramString += `${param}=${value ? 'True' : 'False'},`;
      } else {
        paramString += `${param}=${value},`;
      }
    }
    rs += paramString.slice(0, -1);
    rs += ')';

    if (this.graph[node].sources.length > 0) {
      rs += '(';
      if (this.graph[node].sources.length === 1) {
        rs += this.nodeName(this.graph[node].sources[0]);
      } else if (this.graph[node].sources.length > 1) {
        rs += '[';
        for (const s of this.graph[node].sources.slice(0, -1)) { // eslint-disable-line
          rs += `${this.nodeName(s)},`;
        }
        rs += this.nodeName(this.graph[node].sources.slice(-1)[0]);
        rs += ']';
      }
      rs += ')';
    }
    rs += '\n';
    return rs;
  }

  // Return a list of the different inputs
  findInputs() {
    const inputs = [];
    for (const [node, value] of Object.entries(this.graph)) { // eslint-disable-line
      if (value.keras_data.name === 'Input') {
        inputs.push(node);
      }
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

  // Generate the line responsible for the Keras Model instanciation
  generateModelFunction() {
    let rs = 'model = keras.models.Model(inputs=';
    const inputs = this.findInputs(this.graph);
    if (inputs.length === 1) {
      rs += this.nodeName(inputs[0]);
    } else if (inputs.length > 1) {
      rs += '[';
      for (const input of inputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(input)}, `;
      }
      rs += `${this.nodeName(inputs.splice(-1)[0])}]`;
    }
    rs += ', outputs=';
    const outputs = this.findOutputs();
    if (outputs.length === 1) {
      rs += this.nodeName(outputs[0]);
    } else if (outputs.length > 1) {
      rs += '[';
      for (const output of outputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(output)}, `;
      }
      rs += `${this.nodeName(outputs.slice(-1)[0])}]`;
    }
    rs += ')\n';
    return rs;
  }

  // Generate a Python function which makes a Keras model
  // The object contains all the nodes for a graph, their sources, targets, and
  // data. This function returns a string containing a Python function which
  // generates a functional Keras model. The layer options are not yet all
  // implemented.
  generatePythonFromGraph() {
    let rs = 'import keras\n';
    rs += '\n';
    rs += 'def build_model():\n';
    const list = this.createTreatmentList(this.graph);
    for (const node of list) { // eslint-disable-line
      const pythonLine = this.generatePythonFromNode(node);
      if (pythonLine !== '') {
        rs += `    ${pythonLine}`;
      }
    }
    rs += `    ${this.generateModelFunction(this.graph)}`;
    rs += '    return model\n';
    return rs;
  }
}
