// class KerasPythonGenerator {
// This class was adapted from backend Python code.
// It will probably be refactored soon.

/* eslint-disable no-param-reassign */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

export default class KerasGeneratorPythonHelper {
  constructor(graph, inputs, outputs, list) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
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

  // Generate the line responsible for the Keras Model instanciation
  generateModelFunction() {
    let rs = 'model = keras.models.Model(inputs=';
    if (this.inputs.length === 1) {
      rs += this.nodeName(this.inputs[0]);
    } else if (this.inputs.length > 1) {
      rs += '[';
      for (const input of this.inputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(input)}, `;
      }
      rs += `${this.nodeName(this.inputs.splice(-1)[0])}]`;
    }
    rs += ', outputs=';
    if (this.outputs.length === 1) {
      rs += this.nodeName(this.outputs[0]);
    } else if (this.outputs.length > 1) {
      rs += '[';
      for (const output of this.outputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(output)}, `;
      }
      rs += `${this.nodeName(this.outputs.slice(-1)[0])}]`;
    }
    rs += ')\n';
    return rs;
  }

  generate() {
    let rs = 'import keras\n';
    rs += '\n';
    rs += 'def build_model():\n';
    for (const node of this.list) { // eslint-disable-line
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
