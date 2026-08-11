// Chapter 1 — Hello, layer. Place Input and Dense, wire them, finish with an
// Output node: the smallest complete model, built entirely by hand.

import type { TutorialDef } from '../tutorials';
import { countLayersNamed, inputShapeEquals, layersConnected } from '../predicates';

const helloLayer: TutorialDef = {
  id: 'hello-layer',
  title: 'Hello, layer',
  description: 'Place your first layers, draw your first connections, and finish a complete (tiny) model.',
  course: { id: 'browser-poet', order: 2 },
  steps: [
    {
      id: 'add-input',
      concepts: ['tensors-and-shapes'],
      title: 'Add an Input layer',
      instruction:
        'Every model starts with an Input. In the left Layer Catalog, click "Input" '
        + 'to place one on the canvas.',
      detail:
        'The Input layer declares what shape of data flows into the network — '
        + 'it is the contract between your data and your model.',
      target: '#layer-template-Input',
      isComplete: $d3 => countLayersNamed($d3, 'Input') >= 1,
    },
    {
      id: 'set-input-shape',
      concepts: ['tensors-and-shapes'],
      title: 'Set the input shape',
      instruction:
        'Select the Input layer on the canvas, then in the right panel set its '
        + 'shape to 28, 28, 1.',
      detail:
        '28×28 pixels, 1 gray channel — the shape of one MNIST digit image. '
        + 'You will train on those in the next chapter.',
      target: '#layerOptions',
      isComplete: $d3 => inputShapeEquals($d3, [28, 28, 1]),
    },
    {
      id: 'add-dense',
      concepts: ['what-is-a-neural-network'],
      title: 'Add a Dense layer',
      instruction: 'Click "Dense" in the Layer Catalog to add a fully-connected layer.',
      detail:
        'Dense connects every input value to every output neuron with a learnable '
        + 'weight — the basic building block of neural networks.',
      target: '#layer-template-Dense',
      isComplete: $d3 => countLayersNamed($d3, 'Dense') >= 1,
    },
    {
      id: 'connect-input-dense',
      concepts: ['what-is-a-neural-network'],
      title: 'Draw your first connection',
      instruction:
        'Hover the Input layer to reveal its connection dots, then drag from its '
        + 'right dot onto the Dense layer.',
      detail: 'Connections define how data flows. On this board, the arrows ARE the architecture.',
      target: '#FlowBoard',
      isComplete: $d3 => layersConnected($d3, 'Input', 'Dense'),
    },
    {
      id: 'add-output',
      title: 'Add an Output node',
      instruction: 'Click "Output" in the Layer Catalog to add an Output node.',
      detail: "The Output node marks which layer produces the model's prediction.",
      target: '#layer-template-Output',
      isComplete: $d3 => countLayersNamed($d3, 'Output') >= 1,
    },
    {
      id: 'connect-dense-output',
      concepts: ['loss'],
      title: 'Complete the model',
      instruction: 'Connect the Dense layer to the Output node the same way.',
      detail:
        'Input → Dense → Output: a complete neural network — tiny, but trainable. '
        + 'Next chapter: train one for real.',
      target: '#FlowBoard',
      isComplete: $d3 => layersConnected($d3, 'Dense', 'Output'),
    },
  ],
};

export default helloLayer;
