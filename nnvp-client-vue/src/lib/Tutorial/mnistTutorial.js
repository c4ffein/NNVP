// Guided "Tutorial mode" driver for building a small MNIST CNN.
//
// This module is intentionally Vue-agnostic and side-effect free so it can be
// unit-tested in isolation. It exports a declarative list of steps; each step's
// `isComplete` predicate inspects the real editor state exposed through the
// `$d3Interface` (see src/lib/D3Interface/D3Interface.js).
//
// Editor-state contract used here (verified against D3Interface / D3Model / D3Layer):
//   $d3Interface.activeGraph.model.d3Layers  -> array of placed layers
//   layer.kerasLayer.name                    -> Keras layer type, e.g. "Conv2D"
//   layer.kerasLayer.parameterValues         -> object of set parameter values

/**
 * Return the array of placed layers for the active graph, or [] when the graph
 * (or interface) is not ready yet. Never throws so predicates stay safe to poll.
 * @param {object} $d3 the $d3Interface instance (or a fake in tests)
 * @returns {Array} placed layers
 */
export function placedLayers($d3) {
  const graph = $d3 && $d3.activeGraph;
  if (!graph || !graph.model || !Array.isArray(graph.model.d3Layers)) return [];
  return graph.model.d3Layers;
}

/**
 * Count placed layers whose Keras type matches `name`.
 * @param {object} $d3 the $d3Interface instance
 * @param {string} name the Keras layer name (e.g. "Dense")
 * @returns {number}
 */
export function countLayersNamed($d3, name) {
  return placedLayers($d3).filter(
    layer => layer && layer.kerasLayer && layer.kerasLayer.name === name,
  ).length;
}

/**
 * True when at least one placed Input layer has a non-empty `shape` parameter.
 * The Input layer's shape is stored in kerasLayer.parameterValues.shape as a
 * tuple_int (array). We treat any non-empty value as "set".
 * @param {object} $d3 the $d3Interface instance
 * @returns {boolean}
 */
export function inputShapeIsSet($d3) {
  return placedLayers($d3).some((layer) => {
    if (!layer || !layer.kerasLayer || layer.kerasLayer.name !== 'Input') return false;
    const values = layer.kerasLayer.parameterValues || {};
    const shape = values.shape;
    if (shape === undefined || shape === null || shape === '') return false;
    if (Array.isArray(shape)) return shape.some(v => v !== '' && v !== null && v !== undefined);
    return true;
  });
}

/**
 * True when the Training panel is currently open in the DOM. Guarded so the
 * predicate is safe to call in a non-DOM (unit test) environment.
 * @returns {boolean}
 */
export function trainingPanelIsOpen() {
  if (typeof document === 'undefined') return false;
  return document.getElementById('trainingZone') !== null;
}

// Declarative step list. Each step:
//   id          unique string id
//   title       short heading for the card
//   instruction what the user should do
//   target      CSS selector (string) or (document) => Element locating the
//               UI element to highlight
//   isComplete  ($d3Interface) => boolean, inspecting real editor state
export const steps = [
  {
    id: 'add-input',
    title: 'Add an Input layer',
    instruction:
      'Every model starts with an Input. In the left Layer Catalog, click "Input" '
      + 'to place an Input layer on the canvas.',
    target: '#layer-template-Input',
    isComplete: $d3 => countLayersNamed($d3, 'Input') >= 1,
  },
  {
    id: 'set-input-shape',
    title: 'Set the input shape',
    instruction:
      'Select the Input layer on the canvas, then in the right panel set its '
      + 'shape to 28, 28, 1 — the dimensions of an MNIST image.',
    target: '#layerOptions',
    isComplete: $d3 => inputShapeIsSet($d3),
  },
  {
    id: 'add-conv2d',
    title: 'Add a Conv2D layer',
    instruction:
      'Convolutions extract spatial features. Click "Conv2D" in the Layer Catalog '
      + 'to add a convolutional layer.',
    target: '#layer-template-Conv2D',
    isComplete: $d3 => countLayersNamed($d3, 'Conv2D') >= 1,
  },
  {
    id: 'add-maxpooling2d',
    title: 'Add a MaxPooling2D layer',
    instruction:
      'Pooling downsamples the feature maps. Click "MaxPooling2D" in the Layer '
      + 'Catalog to add a pooling layer.',
    target: '#layer-template-MaxPooling2D',
    isComplete: $d3 => countLayersNamed($d3, 'MaxPooling2D') >= 1,
  },
  {
    id: 'add-flatten',
    title: 'Add a Flatten layer',
    instruction:
      'Before the dense classifier the 2D feature maps must be flattened. Click '
      + '"Flatten" in the Layer Catalog.',
    target: '#layer-template-Flatten',
    isComplete: $d3 => countLayersNamed($d3, 'Flatten') >= 1,
  },
  {
    id: 'add-dense-hidden',
    title: 'Add a Dense layer',
    instruction:
      'Add a fully-connected hidden layer: click "Dense" in the Layer Catalog.',
    target: '#layer-template-Dense',
    isComplete: $d3 => countLayersNamed($d3, 'Dense') >= 1,
  },
  {
    id: 'add-dense-output',
    title: 'Add the output Dense layer',
    instruction:
      'Add a second Dense layer to act as the 10-class output (one unit per MNIST '
      + 'digit). Click "Dense" again in the Layer Catalog.',
    target: '#layer-template-Dense',
    isComplete: $d3 => countLayersNamed($d3, 'Dense') >= 2,
  },
  {
    id: 'open-training',
    title: 'Compile & train on MNIST',
    instruction:
      'Your MNIST CNN is complete: Input → Conv2D → MaxPooling2D → Flatten → Dense '
      + '→ Dense. Open "Training" in the top menu to compile the model and train it '
      + 'on the MNIST dataset.',
    target: '#generalMenu',
    isComplete: () => trainingPanelIsOpen(),
  },
];

/**
 * Look up a step by id (handy for tests and callers).
 * @param {string} id
 * @returns {object|undefined}
 */
export function getStep(id) {
  return steps.find(step => step.id === id);
}

export const totalSteps = steps.length;

export default steps;
