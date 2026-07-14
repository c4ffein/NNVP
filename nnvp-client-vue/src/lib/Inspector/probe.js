// Inspect mode: build a "probe" over a trained tf.LayersModel that exposes
// EVERY layer's output, and map each output back to the nnvp layer id it came
// from. The probe is a tf.model({inputs: model.inputs, outputs: [...]}) over
// the model's own layer objects — it shares the trained weights, no copy.
//
// The output -> layer-id mapping relies on the codegen contract
// (KerasGeneratorJavascriptHelper): the generated createModel() instantiates
// exactly one tf layer per real graph node (Input nodes only in the
// functional form, Output nodes never), in `KerasGenerator.list` order — the
// topological treatment order. tfjs stamps every layer with a global
// creation-order counter (`layer.id`), so the model's non-InputLayer layers
// sorted by that counter line up 1:1 with the real node ids in list order.
// This holds for both forms the generator emits: tf.sequential() (model.add
// order, implicit InputLayer hidden from model.layers) and functional
// tf.model (layers constructed top-to-bottom by the generated code).
//
// tfjs is passed in, never imported: the core stays pure enough to test
// under bun with the real tfjs or a fake (see tests/suites/inspector.js).

import KerasGenerator from '../KerasInterface/KerasGenerator';
import { summarizeActivation, activationToPixels } from './activationSummary';

/**
 * The nnvp ids of the graph nodes that become tf layers, in the order the
 * generated code creates them (KerasGenerator.list minus Input/Output nodes).
 * @param {string|object} graphJson the board JSON (BoardInterface.getGraphJSON)
 */
export function orderedRealLayerIds(graphJson) {
  // KerasGenerator mutates the layer objects it is given — always feed it an
  // owned copy.
  const json = typeof graphJson === 'string'
    ? JSON.parse(graphJson) : JSON.parse(JSON.stringify(graphJson));
  const generator = new KerasGenerator(json, true);
  return generator.list.filter((id) => {
    const { name } = generator.graph[id].keras_data;
    return name !== 'Input' && name !== 'Output';
  });
}

/**
 * Pair the model's layers with nnvp layer ids (see the contract above).
 * @param {Array} layers model.layers (tf layers: getClassName(), id)
 * @param {Array} ids orderedRealLayerIds() result
 * @returns {Array<{id, layer}>} in generation order
 */
export function matchLayersToIds(layers, ids) {
  const real = layers
    .filter(layer => layer.getClassName() !== 'InputLayer')
    .sort((a, b) => a.id - b.id);
  if (real.length !== ids.length) {
    throw new Error(
      `Inspector: model has ${real.length} layers but the graph has ${ids.length} — `
      + 'the board changed since this model was trained.',
    );
  }
  return real.map((layer, i) => ({ id: ids[i], layer }));
}

/**
 * Build the multi-output probe model over a trained model.
 * Do NOT call probe.dispose(): its layers/weights belong to the source model.
 * @returns {{ probe, layerIds }} probe outputs are aligned with layerIds
 */
export function buildProbe(model, graphJson, tf) {
  const matched = matchLayersToIds(model.layers, orderedRealLayerIds(graphJson));
  const probe = tf.model({
    inputs: model.inputs,
    outputs: matched.map(({ layer }) => layer.output),
  });
  return { probe, layerIds: matched.map(({ id }) => id) };
}

/**
 * Inspection entries for the graph's Input node(s): the probe only taps real
 * tf layers, but the sample ITSELF is the input's "activation" — publishing
 * it makes the Input node show the actual digit/image being inspected.
 * Multi-input models get the same sample on every Input node (training only
 * feeds one dataset, so that is what the model actually received).
 * @param {string|object} graphJson the board JSON (BoardInterface.getGraphJSON)
 * @param {Float32Array} sampleData flat sample values
 * @param {number[]} sampleShape the sample's shape WITHOUT the batch dimension
 * @returns {object} layerId -> { shape, summary, pixels }
 */
export function inputEntries(graphJson, sampleData, sampleShape) {
  const json = typeof graphJson === 'string' ? JSON.parse(graphJson) : graphJson;
  const summary = summarizeActivation(sampleData, sampleShape);
  const entry = { shape: sampleShape, summary, pixels: activationToPixels(summary) };
  const result = {};
  const walk = (layers) => {
    (layers || []).forEach((layer) => {
      if (layer.kerasLayer && layer.kerasLayer.name === 'Input') result[layer.id] = entry;
      walk(layer.children);
    });
  };
  walk(json.layers);
  return result;
}

/**
 * Run one sample through the probe and summarize every layer's activations.
 * @param probe from buildProbe
 * @param {Array} layerIds from buildProbe
 * @param sampleTensor a [1, ...inputShape] tensor (owned by the caller)
 * @param {{channelOffsets?: Object}} [opts] per-layer-id first conv channel
 *   to summarize (from the 3D layer panel's channel paging)
 * @returns {Promise<object>} layerId -> { shape, summary, pixels }
 *   (plain Float32Arrays throughout — every intermediate tensor is disposed)
 */
export async function runInspection(probe, layerIds, sampleTensor, opts) {
  const outputs = probe.predict(sampleTensor);
  const tensors = Array.isArray(outputs) ? outputs : [outputs];
  const result = {};
  try {
    for (let i = 0; i < tensors.length; i += 1) {
      const data = await tensors[i].data(); // eslint-disable-line no-await-in-loop
      const shape = tensors[i].shape.slice(1); // drop the batch dimension
      const channelOffset = opts && opts.channelOffsets
        ? opts.channelOffsets[layerIds[i]] || 0 : 0;
      const summary = summarizeActivation(data, shape, { channelOffset });
      result[layerIds[i]] = { shape, summary, pixels: activationToPixels(summary) };
    }
  } finally {
    tensors.forEach(tensor => tensor.dispose());
  }
  return result;
}
