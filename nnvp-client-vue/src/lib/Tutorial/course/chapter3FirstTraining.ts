// Chapter 2 — Train your first model. A dense MNIST net, trained for real,
// in the browser: dataset, epochs, the Train button, and a falling loss curve.

import type { TutorialDef } from '../tutorials';
import {
  countLayersNamed,
  datasetSelected,
  epochsAtMost,
  inputShapeEquals,
  layersConnected,
  menuTarget,
  trainingPanelIsOpen,
  trainingTabTarget,
} from '../predicates';
import { epochsSeenOn, runFinishedOn, runStartedOn } from '../sessionSignals';

const firstTraining: TutorialDef = {
  id: 'first-training',
  title: 'Train your first model',
  description: 'Load an MNIST network, press Train, and watch the loss fall — live, in your browser.',
  course: { id: 'browser-poet', order: 3 },
  steps: [
    {
      id: 'get-mnist-net',
      concepts: ['tensors-and-shapes'],
      title: 'Get an MNIST network',
      instruction:
        'Open File > Templates in the top menu and load "2D Dense for MNIST" — or '
        + 'press "Do it for me" below. (You can also build it yourself: '
        + 'Input 28, 28, 1 → Flatten → Dense → Dense → Output.)',
      detail:
        'Loading a template replaces your board, but it is undoable — Ctrl+Z brings '
        + 'your work back. Flatten unrolls the 28×28 image into 784 plain numbers '
        + 'a Dense layer can read.',
      target: menuTarget('Templates'),
      action: { kind: 'loadTemplate', template: '2D Dense for MNIST' },
      isComplete: $d3 => inputShapeEquals($d3, [28, 28, 1])
        && countLayersNamed($d3, 'Flatten') >= 1
        && countLayersNamed($d3, 'Dense') >= 2
        && layersConnected($d3, 'Dense', 'Output'),
    },
    {
      id: 'open-training',
      title: 'Open the Training panel',
      instruction: 'Open Panels > Training in the top menu.',
      detail:
        'Training runs entirely in your browser with TensorFlow.js — no server, '
        + 'your data never leaves the tab.',
      target: menuTarget('Training'),
      isComplete: () => trainingPanelIsOpen(),
    },
    {
      id: 'confirm-dataset',
      title: 'Confirm the MNIST dataset',
      instruction:
        'In the Dataset tab, make sure "MNIST" is selected and wait for the sample '
        + 'digits to appear.',
      detail: '60,000 handwritten digits — the "hello world" of machine learning.',
      target: trainingTabTarget('Dataset'),
      isComplete: () => datasetSelected('MNIST'),
    },
    {
      id: 'set-epochs',
      concepts: ['training-loop'],
      title: 'Keep it short',
      instruction: 'In the Options tab, set epochs to 3.',
      detail:
        'One epoch = one full pass over the training data. Three is plenty for a '
        + 'first look.',
      target: trainingTabTarget('Options'),
      isComplete: () => epochsAtMost(5),
    },
    {
      id: 'press-train',
      concepts: ['gradient-descent'],
      title: 'Train!',
      instruction: 'Press ▶ Start Training.',
      detail:
        'The editor generates TensorFlow.js code from your diagram and runs it '
        + 'right here in the tab.',
      target: '.train-button',
      isComplete: () => runStartedOn('MNIST'),
    },
    {
      id: 'watch-loss',
      concepts: ['loss', 'gradient-descent'],
      title: 'Watch the loss fall',
      instruction: 'Watch the Charts tab: the loss curve should fall as the model learns.',
      detail:
        'Loss measures how wrong the model is on average; training is the process '
        + 'of pushing it down.',
      target: trainingTabTarget('Charts'),
      isComplete: () => epochsSeenOn('MNIST') >= 1,
    },
    {
      id: 'run-finishes',
      concepts: ['generalization'],
      title: 'Let it finish',
      instruction: 'Let the run complete — or press ■ Stop once you have seen enough.',
      detail:
        'Either way you now have a trained model in memory. The next chapter looks '
        + 'inside one.',
      target: '#trainingZone',
      isComplete: () => runFinishedOn('MNIST'),
    },
  ],
};

export default firstTraining;
