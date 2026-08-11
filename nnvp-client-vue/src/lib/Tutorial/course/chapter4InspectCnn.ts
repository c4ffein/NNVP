// Chapter 3 — See what it learned. A real CNN this time, then Inspect and the
// 3D view to look at what the trained layers actually compute.

import type { TutorialDef } from '../tutorials';
import {
  activeTrainingTab,
  countLayersNamed,
  elementPresent,
  menuTarget,
  selectedLayerIs,
  trainButtonTarget,
  trainingTabTarget,
} from '../predicates';
import { runFinishedOn, runStartedOn } from '../sessionSignals';

const inspectCnn: TutorialDef = {
  id: 'inspect-cnn',
  title: 'See what it learned',
  description: 'Train a convolutional network on MNIST, then inspect its activations — in 2D and 3D.',
  course: { id: 'browser-poet', order: 4 },
  steps: [
    {
      id: 'load-cnn',
      concepts: ['convolutions'],
      title: 'Load the CNN',
      instruction:
        'Open File > Templates and load "2D Conv for MNIST" — or press "Do it for me".',
      detail:
        'Convolutions slide small windows across the image and learn local patterns '
        + 'like strokes and curves — structure a Dense layer cannot see.',
      target: menuTarget('Templates'),
      action: { kind: 'loadTemplate', template: '2D Conv for MNIST' },
      isComplete: $d3 => countLayersNamed($d3, 'Conv2D') >= 1
        && countLayersNamed($d3, 'MaxPooling2D') >= 1
        && countLayersNamed($d3, 'Flatten') >= 1
        && countLayersNamed($d3, 'Output') >= 1,
    },
    {
      id: 'tour-conv',
      concepts: ['convolutions'],
      title: 'Meet Conv2D',
      instruction:
        'Click the Conv2D layer on the canvas — its parameters (filters, '
        + 'kernel_size) appear in the right panel.',
      detail:
        'Each filter is one learnable pattern detector; kernel_size is the window '
        + 'it slides across the image.',
      target: '#layerOptions',
      isComplete: $d3 => selectedLayerIs($d3, 'Conv2D'),
    },
    {
      id: 'train-cnn',
      title: 'Train the CNN',
      instruction:
        'Open Panels > Training (if needed) and press ▶ Start Training on MNIST.',
      detail:
        "Same data as chapter 2, better architecture — watch the accuracy beat the "
        + 'dense net.',
      target: trainButtonTarget,
      isComplete: () => runStartedOn('MNIST', { withLayer: 'Conv2D' }),
    },
    {
      id: 'cnn-run-finishes',
      title: 'Let it finish',
      instruction: 'Let the run complete — or press ■ Stop after a few epochs.',
      target: '#trainingZone',
      isComplete: () => runFinishedOn('MNIST', { withLayer: 'Conv2D' }),
    },
    {
      id: 'open-inspect',
      concepts: ['activations'],
      title: 'Open Inspect',
      instruction: 'Click the Inspect tab in the Training panel.',
      detail:
        'Inspect feeds a sample through the trained model and shows what each '
        + 'layer computed for it.',
      target: trainingTabTarget('Inspect'),
      isComplete: () => activeTrainingTab() === 'Inspect',
    },
    {
      id: 'open-viz3d',
      title: 'See it in 3D',
      instruction: 'Open Panels > 3D View in the top menu.',
      detail:
        'The 3D view stacks your layers in space and recolors them with the '
        + 'activations you inspect — watch features light up layer by layer.',
      target: menuTarget('3D View'),
      isComplete: () => elementPresent('#viz3dWindow'),
    },
  ],
};

export default inspectCnn;
