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

  pythonToJsParamName(paramName) {
    return paramName.replace(/_./g, r => r[1].toUpperCase());
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

  generateParams(parameterValues, parameterDefinitions) {
    let paramString = '{';
    // eslint-disable-next-line
    for (const [param, value] of Object.entries(parameterValues)) {
      const paramName = this.pythonToJsParamName(param);
      const paramDef = parameterDefinitions ? parameterDefinitions[param] : null;
      if (typeof value === 'string') {
        paramString += `${paramName}:'${value}',`;
      } else if (Array.isArray(value)) {
        if (paramDef && paramDef.convertToNumber === true && paramDef.value.length === 1) {
          paramString += `${paramName}:'${value[0]}',`;
        } else paramString += `${paramName}:${this.generateTuple(value)},`;
      } else if (typeof value === 'boolean') {
        paramString += `${paramName}:${value ? 'true' : 'false'},`;
      } else {
        paramString += `${paramName}:${value},`;
      }
    }
    paramString += '}';
    return paramString;
  }

  // Return a string containing Javascript instructions to add the node.
  // Options are set to defaults for now, only 3 layer types are used.
  generateJavascriptFromNode(node) {
    let rs = `const ${this.nodeName(node)} = `;
    if (this.graph[node].keras_data.name === 'Output') {
      return '';
    }

    rs += 'tf.layers.';
    rs += this.pythonToJsLayerName(this.graph[node].keras_data.name);
    // TODO : use D3Interface parameterDef if not present in the instance
    rs += `(${this.generateParams(
      this.graph[node].keras_data.parameterValues, this.graph[node].keras_data.parameterDef,
    )})`;

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
      this.generateParams(params, this.graph[node].keras_data.parameterDef)}));\n`;
  }

  // Generate the line responsible for the Keras Model instanciation
  generateModelFunction() {
    let rs = 'const model = tf.model({inputs:';
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
    // Could optionally start by let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    let rs = 'function createModel() {\n';
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
    // Could optionally start by let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    let rs = 'function createModel() {\n';
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
