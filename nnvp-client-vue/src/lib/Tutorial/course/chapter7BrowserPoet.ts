// Chapter 6 — Your browser poet. Pre-train GPT-Mini on the big poetry corpus,
// checkpoint it, fine-tune on Shakespeare's sonnets, read the lineage in the
// Models window, and generate poetry.

import type { TutorialDef } from '../tutorials';
import {
  boardIsDirty,
  countLayersNamed,
  datasetSelected,
  elementPresent,
  generatedTextPresent,
  menuTarget,
  phase2Configured,
} from '../predicates';
import { checkpointsThisSession, runFinishedOn } from '../sessionSignals';

const browserPoet: TutorialDef = {
  id: 'browser-poet',
  title: 'Your browser poet',
  description: 'Pre-train GPT-Mini on poetry, fine-tune it on Shakespeare’s sonnets, and let it write.',
  course: { id: 'browser-poet', order: 7 },
  steps: [
    {
      id: 'load-gpt-mini',
      concepts: ['transformers', 'attention'],
      title: 'Load GPT-Mini',
      instruction:
        'Open File > Templates and load "GPT-Mini Poetry" — or press "Do it for me".',
      detail:
        'The very recipe of the big language models — stacked transformer blocks '
        + 'over character embeddings — just small enough for a browser tab.',
      target: menuTarget('Templates'),
      action: { kind: 'loadTemplate', template: 'GPT-Mini Poetry' },
      isComplete: $d3 => countLayersNamed($d3, 'TransformerBlock') >= 2,
    },
    {
      id: 'pick-gutenberg',
      concepts: ['pretraining-finetuning'],
      title: 'Pick the big corpus',
      instruction:
        'Open Panels > Training; in the Dataset tab select "GutenbergPoetryXL".',
      detail:
        'Megabytes of public-domain English poetry with a 96-character context '
        + 'window. More text, better poet.',
      target: '#dataset-selector-selector',
      isComplete: () => datasetSelected('GutenbergPoetryXL'),
    },
    {
      id: 'pretrain',
      concepts: ['training-loop'],
      title: 'Pre-train',
      instruction:
        'Press ▶ Start Training and let at least one epoch finish (■ Stop is fine '
        + 'after that).',
      detail:
        'This is pre-training: learning the general shape of poetry before '
        + 'specializing in a style.',
      target: '.train-button',
      isComplete: () => runFinishedOn('GutenbergPoetryXL'),
    },
    {
      id: 'make-it-yours',
      title: 'Make it yours',
      instruction: 'Rename a layer — or write a comment on one — in the right panel.',
      detail:
        'Names and comments are the annotation layer of your model’s identity: '
        + 'they mark this state as yours without changing what it computes.',
      target: '#layerOptions',
      isComplete: $d3 => boardIsDirty($d3),
    },
    {
      id: 'save-checkpoint',
      title: 'Save a checkpoint',
      instruction: 'Press Ctrl+S (or File > Save) to save a checkpoint.',
      detail:
        'A checkpoint pins this exact state into your model lineage, parented on '
        + 'the state it evolved from — like a commit.',
      target: menuTarget('Save'),
      isComplete: () => checkpointsThisSession() >= 1,
    },
    {
      id: 'configure-finetune',
      concepts: ['pretraining-finetuning'],
      title: 'Configure fine-tuning',
      instruction: 'In the Options tab, enable Fine-tune and pick "ShakespeareSonnets".',
      detail:
        'Curriculum learning: first the broad corpus, then a tiny, focused one — '
        + 'the model keeps what it learned and adapts its style to the sonnets.',
      target: '#phase2-enabled',
      isComplete: () => phase2Configured('ShakespeareSonnets'),
    },
    {
      id: 'finetune-run',
      concepts: ['generalization'],
      title: 'Fine-tune',
      instruction:
        'Press ▶ Start Training: the run pre-trains on the big corpus, then '
        + 'continues on the sonnets.',
      target: '.train-button',
      isComplete: () => runFinishedOn('GutenbergPoetryXL', { phase2Dataset: 'ShakespeareSonnets' }),
    },
    {
      id: 'see-lineage',
      title: 'See your model’s story',
      instruction: 'Open Panels > Models.',
      detail:
        'The Models window shows your checkpoints and runs as a commit graph — '
        + 'the story of everything you built in this course.',
      target: menuTarget('Models'),
      isComplete: () => elementPresent('#modelsWindow'),
    },
    {
      id: 'poetry',
      concepts: ['sampling-temperature'],
      title: 'Generate poetry',
      instruction:
        'Back in the Inspect tab: seed it with a line you like, try Temperature '
        + '0.4, then 1.2, and press Generate.',
      detail:
        'Low temperature recites; high temperature invents. Somewhere in between '
        + 'is your browser poet. Congratulations — you trained a language model, '
        + 'end to end.',
      target: '#inspect-temperature-input',
      isComplete: () => generatedTextPresent(),
    },
  ],
};

export default browserPoet;
