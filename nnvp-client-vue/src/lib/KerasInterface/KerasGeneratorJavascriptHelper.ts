/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */

import { quoteString, assertSafeIdentifier, assertSafeIdSuffix } from './codegenSafety';
import {
  isTextLayer, textLayerClassName, textLayerJsSource, usedTextLayers,
} from './textLayers';
import type { GeneratorGraph } from './KerasGenerator';
import type { GeneratorParamDef } from './KerasGeneratorPythonHelper';
import type { NnvpLayerId, ParameterDef, ParameterValue } from '../../types/model';

export default class KerasGeneratorJavascriptHelper {
  graph: GeneratorGraph;
  inputs: NnvpLayerId[];
  outputs: NnvpLayerId[];
  list: NnvpLayerId[];
  sequential: boolean;

  constructor(
    graph: GeneratorGraph,
    inputs: NnvpLayerId[],
    outputs: NnvpLayerId[],
    list: NnvpLayerId[],
    sequential?: boolean,
  ) {
    this.graph = graph;
    this.inputs = inputs;
    this.outputs = outputs;
    this.list = list;
    this.sequential = sequential || false;
  }

  pythonToJsLayerName(layerName: string): string {
    // Acronym-named layers escape the lowercase-first-letter rule: tfjs
    // exposes them fully lowercased (tf.layers.lstm, not tf.layers.lSTM).
    // ReLU/LeakyReLU are NOT exceptions — tfjs really names those reLU /
    // leakyReLU, which the generic rule already produces.
    const acronymFactories: Record<string, string> = {
      LSTM: 'lstm', GRU: 'gru', ELU: 'elu', PReLU: 'prelu',
    };
    const acronym = acronymFactories[layerName];
    if (acronym !== undefined) return acronym;
    return layerName.replace(
      /(.)(.*?)([1-3]D)?$/,
      (m, f: string, s: string, l: string | undefined) =>
        `${f.toLowerCase()}${s}${l ? l.toLowerCase() : ''}`,
    );
  }

  pythonToJsParamName(paramName: string): string {
    return paramName.replace(/_./g, r => r[1]!.toUpperCase());
  }

  // Returns the name given to the node in the generated Javascript code
  nodeName(node: NnvpLayerId): string {
    assertSafeIdSuffix(node);
    if (this.graph[node]!.keras_data!.name === 'Input') {
      return `input_${node}`;
    }
    if (this.graph[node]!.keras_data!.name === 'Output') {
      return `output_${node}`;
    }
    return `layer_${node}`;
  }

  generateTuple(param: ArrayLike<unknown>): string {
    let tupleString = '[';
    for (let i = 0; i < param.length; i += 1) {
      const value = param[i];
      if (typeof (value) === 'string') {
        tupleString += `${quoteString(value)},`;
      } else if (Array.isArray(value)) {
        tupleString += `${this.generateTuple(value)},`;
      } else {
        tupleString += `${value},`;
      }
    }
    tupleString += ']';
    return tupleString;
  }

  generateParams(
    parameterValues: Record<string, ParameterValue>,
    parameterDefinitions?: Record<string, ParameterDef> | null,
  ): string {
    let paramString = '{';
    for (const [param, value] of Object.entries(parameterValues)) {
      const paramName = assertSafeIdentifier(this.pythonToJsParamName(param), 'parameter name');
      const paramDef = (parameterDefinitions ? parameterDefinitions[param] : null) as
        GeneratorParamDef | null | undefined;
      if (typeof value === 'string') {
        paramString += `${paramName}:${quoteString(value)},`;
      } else if (Array.isArray(value)) {
        if (paramDef && paramDef.convertToNumber === true && paramDef.value!.length === 1) {
          paramString += `${paramName}:${quoteString(value[0])},`;
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

  // The constructor expression for one node: a stock tf.layers factory call,
  // or `new Nnvp<Name>(...)` for the NNVP text layers whose class definitions
  // the generate*() entrypoints prepend.
  layerConstructor(node: NnvpLayerId): string {
    const { name } = this.graph[node]!.keras_data!;
    const params = this.generateParams(
      this.graph[node]!.keras_data!.parameterValues, this.graph[node]!.keras_data!.parameterDef,
    );
    if (isTextLayer(name)) {
      return `new ${textLayerClassName(name)}(${params})`;
    }
    return `tf.layers.${
      assertSafeIdentifier(this.pythonToJsLayerName(name), 'layer type name')}(${params})`;
  }

  // The class definitions the generated code must carry, for the text layers
  // present in this graph (empty string when none are).
  textLayerPreamble(): string {
    const names = usedTextLayers(this.list.map(node => this.graph[node]!.keras_data!.name));
    if (names.length === 0) return '';
    return `${names.map(name => textLayerJsSource(name)).join('\n')}\n`;
  }

  // Return a string containing Javascript instructions to add the node.
  // Options are set to defaults for now, only 3 layer types are used.
  generateJavascriptFromNode(node: NnvpLayerId): string {
    let rs = `const ${this.nodeName(node)} = `;
    if (this.graph[node]!.keras_data!.name === 'Output') {
      return '';
    }

    rs += this.layerConstructor(node);

    if (this.graph[node]!.sources.length > 0) {
      rs += '.apply(';
      if (this.graph[node]!.sources.length === 1) {
        rs += this.nodeName(this.graph[node]!.sources[0]!);
      } else if (this.graph[node]!.sources.length > 1) {
        rs += '[';
        for (const s of this.graph[node]!.sources.slice(0, -1)) {
          rs += `${this.nodeName(s)},`;
        }
        rs += this.nodeName(this.graph[node]!.sources.slice(-1)[0]!);
        rs += ']';
      }
      rs += ');';
    }
    rs += '\n';
    return rs;
  }

  // Easier version we can use if the model can be defined as a sequential one
  generateSequentialJavascriptFromNode(node: NnvpLayerId, addModelInput: boolean): string {
    if (this.graph[node]!.keras_data!.name === 'Output' || this.graph[node]!.keras_data!.name === 'Input') {
      return '';
    }
    const params: Record<string, ParameterValue> = addModelInput
      ? {
        ...this.graph[node]!.keras_data!.parameterValues,
        input_shape: (this.graph[this.inputs[0]!]!.keras_data!.parameterValues.shape
            || [100, 100]) as ParameterValue,
      }
      : this.graph[node]!.keras_data!.parameterValues;
    const { name } = this.graph[node]!.keras_data!;
    const paramString = this.generateParams(params, this.graph[node]!.keras_data!.parameterDef);
    const constructor = isTextLayer(name)
      ? `new ${textLayerClassName(name)}(${paramString})`
      : `tf.layers.${
        assertSafeIdentifier(this.pythonToJsLayerName(name), 'layer type name')}(${paramString})`;
    return `model.add(${constructor});\n`;
  }

  // Generate the line responsible for the Keras Model instanciation
  generateModelFunction(): string {
    let rs = 'const model = tf.model({inputs:';
    if (this.inputs.length === 1) {
      rs += this.nodeName(this.inputs[0]!);
    } else if (this.inputs.length > 1) {
      rs += '[';
      for (const input of this.inputs.slice(0, -1)) {
        rs += `${this.nodeName(input)}, `;
      }
      rs += `${this.nodeName(this.inputs.slice(-1)[0]!)}]`;
    }
    rs += ', outputs:';
    if (this.outputs.length === 1) {
      rs += this.nodeName(this.outputs[0]!);
    } else if (this.outputs.length > 1) {
      rs += '[';
      for (const output of this.outputs.slice(0, -1)) {
        rs += `${this.nodeName(output)}, `;
      }
      rs += `${this.nodeName(this.outputs.slice(-1)[0]!)}]`;
    }
    rs += '});\n';
    return rs;
  }

  generateFunctional(): string {
    // Could optionally start by let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    let rs = this.textLayerPreamble();
    rs += 'function createModel() {\n';
    this.list.forEach((node) => {
      const jsLine = this.generateJavascriptFromNode(node);
      if (jsLine !== '') {
        rs += `    ${jsLine}`;
      }
    });
    rs += `    ${this.generateModelFunction()}`;
    rs += '    return model;\n';
    rs += '}\n';
    return rs;
  }

  generateSequential(): string {
    // Could optionally start by let rs = 'import * as tf from \'@tensorflow/tfjs\';\n';
    let rs = this.textLayerPreamble();
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

  generate(sequential?: boolean): string {
    sequential = sequential === undefined ? this.sequential : sequential;
    return sequential ? this.generateSequential() : this.generateFunctional();
  }
}
