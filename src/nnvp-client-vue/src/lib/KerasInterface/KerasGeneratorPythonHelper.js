// class KerasPythonGenerator {
// This class was adapted from backend Python code.
// It will probably be refactored soon.

/* eslint-disable no-param-reassign */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

export default class KerasGeneratorPythonHelper {
  constructor(graph, inputs, outputs, list, sequential) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
    this.sequential = sequential || false;
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

  generateParams(parameterValues) {
    let paramString = '';
    // eslint-disable-next-line
    for (const [param, value] of Object.entries(parameterValues)) {
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
    return paramString;
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
    // TODO : use parametersDef?
    rs += `(${this.generateParams(this.graph[node].keras_data.parameterValues).slice(0, -1)})`;

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

  // Easier version we can use if the model can be defined as a sequential one
  generateSequentialPythonFromNode(node, addModelInput) {
    if (this.graph[node].keras_data.name === 'Output' || this.graph[node].keras_data.name === 'Input') {
      return '';
    }
    const inputShapeParam = !addModelInput ? ''
      : `${Object.keys(this.graph[node].keras_data.parameterValues).length === 0 ? '' : ', '}${
        `input_shape = ${this.generateTuple(
          this.graph[this.inputs[0]].keras_data.parameterValues.shape || [100, 100],
        )}`}`;

    return `model.add(keras.layers.${this.graph[node].keras_data.name}(${
      this.generateParams(this.graph[node].keras_data.parameterValues).slice(0, -1)}${
      inputShapeParam}))\n`;
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

  generateFunctional() {
    let rs = 'from tensorflow import keras\n';
    rs += '\n';
    rs += 'def build_model():\n';
    this.list.forEach((node) => {
      const pythonLine = this.generatePythonFromNode(node);
      if (pythonLine !== '') {
        rs += `    ${pythonLine}`;
      }
    });
    rs += `    ${this.generateModelFunction(this.graph)}`;
    rs += '    return model\n';
    return rs;
  }

  generateSequential() {
    let rs = 'from tensorflow import keras\n';
    rs += '\n';
    rs += 'def build_model():\n';
    rs += '    model = keras.models.Sequential()\n';
    this.list.forEach((node, index) => {
      const pythonLine = this.generateSequentialPythonFromNode(node, index === 1);
      if (pythonLine !== '') {
        rs += `    ${pythonLine}`;
      }
    });
    rs += '    return model\n';
    return rs;
  }

  generate(sequential) {
    sequential = sequential === undefined ? this.sequential : sequential;
    return sequential ? this.generateSequential() : this.generateFunctional();
  }
}
