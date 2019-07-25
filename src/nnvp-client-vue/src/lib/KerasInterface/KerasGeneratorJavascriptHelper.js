/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */
/* eslint class-methods-use-this: ["error", { "exceptMethods": ["generateTuple",
                                                                "jsonToGraph"] }] */

export default class KerasGeneratorJavascriptHelper {
  constructor(graph, inputs, outputs, list, sequential) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
    this.sequential = sequential || false;
  }

  pythonToJsLayerName(layerName) {
    return layerName.replace(
      /(.)(.*?)([1-3]D)?$/, (m, f, s, l) => `${f.toLowerCase()}${s}${l ? l.toLowerCase() : ''}`,
    );
  }

  // Returns the name given to the node in the generated Javascript code
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
    let tupleString = '[';
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
    tupleString += ']';
    return tupleString;
  }

  generateParams(parameterValues) {
    let paramString = '{';
    // eslint-disable-next-line
    for (const [param, value] of Object.entries(parameterValues)) {
      if (typeof value === 'string') {
        paramString += `${param}:'${value}',`;
      } else if (Array.isArray(value)) {
        paramString += `${param}:${this.generateTuple(value)},`;
      } else if (typeof value === 'boolean') {
        paramString += `${param}:${value ? 'True' : 'False'},`;
      } else {
        paramString += `${param}:${value},`;
      }
    }
    paramString += '}';
    return paramString;
  }

  // Return a string containing Javascript instructions to add the node.
  // Options are set to defaults for now, only 3 layer types are used.
  generateJavascriptFromNode(node) {
    let rs = `${this.nodeName(node)} = `;
    if (this.graph[node].keras_data.name === 'Output') {
      return '';
    }

    rs += 'tf.layers.';
    rs += this.pythonToJsLayerName(this.graph[node].keras_data.name);
    // TODO : use parametersDef?
    rs += `(${this.generateParams(this.graph[node].keras_data.parameterValues)})`;

    if (this.graph[node].sources.length > 0) {
      rs += '.apply(';
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
      rs += ');';
    }
    rs += '\n';
    return rs;
  }

  // Easier version we can use if the model can be defined as a sequential one
  generateSequentialJavascriptFromNode(node, addModelInput) {
    if (this.graph[node].keras_data.name === 'Output' || this.graph[node].keras_data.name === 'Input') {
      return '';
    }
    const params = addModelInput
      ? {
        ...this.graph[node].keras_data.parameterValues,
        input_shape: this.graph[this.inputs[0]].keras_data.parameterValues.shape
            || [100, 100],
      }
      : this.graph[node].keras_data.parameterValues;
    return `model.add(tf.layers.${
      this.pythonToJsLayerName(this.graph[node].keras_data.name)}(${
      this.generateParams(params)});\n`;
  }

  // Generate the line responsible for the Keras Model instanciation
  generateModelFunction() {
    let rs = 'model = tf.models.Model({inputs:';
    if (this.inputs.length === 1) {
      rs += this.nodeName(this.inputs[0]);
    } else if (this.inputs.length > 1) {
      rs += '[';
      for (const input of this.inputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(input)}, `;
      }
      rs += `${this.nodeName(this.inputs.splice(-1)[0])}]`;
    }
    rs += ', outputs:';
    if (this.outputs.length === 1) {
      rs += this.nodeName(this.outputs[0]);
    } else if (this.outputs.length > 1) {
      rs += '[';
      for (const output of this.outputs.slice(0, -1)) { // eslint-disable-line
        rs += `${this.nodeName(output)}, `;
      }
      rs += `${this.nodeName(this.outputs.slice(-1)[0])}]`;
    }
    rs += '});\n';
    return rs;
  }

  generateFunctional() {
    let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    rs += '\n';
    rs += 'function createModel() {\n';
    this.list.forEach((node) => {
      const jsLine = this.generateJavascriptFromNode(node);
      if (jsLine !== '') {
        rs += `    ${jsLine}`;
      }
    });
    rs += `    ${this.generateModelFunction(this.graph)}`;
    rs += '    return model;\n';
    rs += '}\n';
    return rs;
  }

  generateSequential() {
    let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    rs += '\n';
    rs += 'function createModel() {\n';
    rs += '    const model = tf.sequential();\n';
    this.list.forEach((node, index) => {
      const jsLine = this.generateSequentialJavascriptFromNode(node, index === 1);
      if (jsLine !== '') {
        rs += `    ${jsLine}`;
      }
    });
    rs += '    return model;\n';
    rs += '}\n';
    return rs;
  }

  generate(sequential) {
    sequential = sequential === undefined ? this.sequential : sequential;
    return sequential ? this.generateSequential() : this.generateFunctional();
  }
}
