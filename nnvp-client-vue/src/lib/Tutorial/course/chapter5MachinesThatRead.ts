// Chapter 4 — Machines that read. Character-level language modeling with an
// LSTM: text becomes numbers, and the Inspect tab becomes a generation console.

import type { TutorialDef } from '../tutorials';
import {
  activeTrainingTab,
  countLayersNamed,
  datasetSelected,
  generatedTextPresent,
  menuTarget,
  trainingPanelIsOpen,
  trainingTabTarget,
} from '../predicates';
import { runFinishedOn, runStartedOn } from '../sessionSignals';

const machinesThatRead: TutorialDef = {
  id: 'machines-that-read',
  title: 'Machines that read',
  description: 'Teach an LSTM to read Shakespeare character by character — and write its first words.',
  course: { id: 'browser-poet', order: 5 },
  steps: [
    {
      id: 'load-lstm',
      concepts: ['recurrence', 'embeddings'],
      title: 'Load the Char-LSTM',
      instruction:
        'Open File > Templates and load "Char-LSTM Poetry" — or press "Do it for me".',
      detail:
        'Text must become numbers first: the Embedding turns each character into a '
        + 'learned vector, and the LSTM reads them one at a time, carrying a memory '
        + 'from character to character.',
      target: menuTarget('Templates'),
      action: { kind: 'loadTemplate', template: 'Char-LSTM Poetry' },
      isComplete: $d3 => countLayersNamed($d3, 'LSTM') >= 1
        && countLayersNamed($d3, 'Embedding') >= 1,
    },
    {
      id: 'open-training',
      title: 'Open the Training panel',
      instruction: 'Open Panels > Training if it is not already open.',
      target: menuTarget('Training'),
      isComplete: () => trainingPanelIsOpen(),
    },
    {
      id: 'pick-shakespeare',
      concepts: ['embeddings'],
      title: 'Pick TinyShakespeare',
      instruction: 'In the Dataset tab, select "TinyShakespeare".',
      detail:
        'About a megabyte of Shakespeare, read character by character over a fixed '
        + '96-character vocabulary. The task: given 40 characters, predict the next one.',
      target: '#dataset-selector-selector',
      isComplete: () => datasetSelected('TinyShakespeare'),
    },
    {
      id: 'train-lstm',
      title: 'Train briefly',
      instruction: 'Press ▶ Start Training. A couple of epochs is enough for recognizable words.',
      detail:
        'This is still classification — just over 96 character classes instead of '
        + '10 digits.',
      target: '.train-button',
      isComplete: () => runStartedOn('TinyShakespeare'),
    },
    {
      id: 'lstm-finishes',
      title: 'Stop when curious',
      instruction: 'Let it finish — or press ■ Stop after an epoch or two.',
      target: '#trainingZone',
      isComplete: () => runFinishedOn('TinyShakespeare'),
    },
    {
      id: 'open-inspect-text',
      title: 'Open the generation console',
      instruction: 'Open the Inspect tab — with a text dataset it becomes a generation console.',
      target: trainingTabTarget('Inspect'),
      isComplete: () => activeTrainingTab() === 'Inspect',
    },
    {
      id: 'generate-first-text',
      concepts: ['sampling-temperature'],
      title: 'Generate your first text',
      instruction:
        'Type a seed (e.g. "shall i "), keep Temperature near 0.8, and press Generate.',
      detail:
        'Temperature scales randomness: low is safe and repetitive, high is wild '
        + 'and misspelled. Your first output will be rough — chapter 5 is about '
        + 'doing better.',
      target: '#inspect-seed-input',
      isComplete: () => generatedTextPresent(),
    },
  ],
};

export default machinesThatRead;
