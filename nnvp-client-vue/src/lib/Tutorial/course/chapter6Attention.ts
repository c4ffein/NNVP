// Chapter 5 — Attention. The transformer, one layer at a time, then a
// head-to-head against chapter 4's LSTM in History/Compare.

import type { TutorialDef } from '../tutorials';
import {
  activeTrainingTab,
  countLayersNamed,
  menuTarget,
  selectedLayerIs,
  trainButtonTarget,
  trainingTabTarget,
} from '../predicates';
import { runFinishedOn, runStartedOn } from '../sessionSignals';

const attention: TutorialDef = {
  id: 'attention',
  title: 'Attention',
  description: 'Tour a small transformer layer by layer, train it, and compare it against your LSTM.',
  course: { id: 'browser-poet', order: 6 },
  steps: [
    {
      id: 'load-transformer',
      concepts: ['attention'],
      title: 'Load the Mini Transformer',
      instruction:
        'Open File > Templates and load "Mini Transformer Poetry" — or press "Do it for me".',
      detail:
        'Transformers replaced recurrence with attention: every position can look '
        + 'at every other position at once, instead of squeezing history through '
        + 'a memory.',
      target: menuTarget('Templates'),
      action: { kind: 'loadTemplate', template: 'Mini Transformer Poetry' },
      isComplete: $d3 => countLayersNamed($d3, 'TransformerBlock') >= 1
        && countLayersNamed($d3, 'PositionalEmbedding') >= 1,
    },
    {
      id: 'meet-positional',
      concepts: ['transformers'],
      title: 'Meet PositionalEmbedding',
      instruction: 'Click the PositionalEmbedding layer to read its parameters.',
      detail:
        'Attention has no built-in sense of order — each position’s index is '
        + 'injected as a learned vector so "dog bites man" reads differently from '
        + '"man bites dog".',
      target: '#layerOptions',
      isComplete: $d3 => selectedLayerIs($d3, 'PositionalEmbedding'),
    },
    {
      id: 'meet-transformer-block',
      concepts: ['attention', 'transformers'],
      title: 'Meet TransformerBlock',
      instruction: 'Now click the TransformerBlock layer.',
      detail:
        'One full attention block: self-attention heads (num_heads) decide which '
        + 'earlier characters matter for each position, then a small feed-forward '
        + 'net (ff_dim) mixes the result.',
      target: '#layerOptions',
      isComplete: $d3 => selectedLayerIs($d3, 'TransformerBlock'),
    },
    {
      id: 'meet-last-token',
      concepts: ['transformers'],
      title: 'Meet LastToken',
      instruction: 'And click the LastToken layer.',
      detail:
        'Only the final position’s vector is used to predict the next character — '
        + 'LastToken slices it out for the softmax head.',
      target: '#layerOptions',
      isComplete: $d3 => selectedLayerIs($d3, 'LastToken'),
    },
    {
      id: 'train-transformer',
      title: 'Train it',
      instruction: 'Open Panels > Training and press ▶ Start Training on TinyShakespeare.',
      target: trainButtonTarget,
      isComplete: () => runStartedOn('TinyShakespeare', { withLayer: 'TransformerBlock' }),
    },
    {
      id: 'transformer-finishes',
      title: 'Let it finish',
      instruction: 'Let the run complete — or press ■ Stop once the loss flattens.',
      target: '#trainingZone',
      isComplete: () => runFinishedOn('TinyShakespeare', { withLayer: 'TransformerBlock' }),
    },
    {
      id: 'open-history',
      title: 'Open History',
      instruction: 'Click the History tab.',
      detail:
        'Every run you make is journaled as events — grouped by model identity, '
        + 'and it survives reloads.',
      target: trainingTabTarget('History'),
      isComplete: () => activeTrainingTab() === 'History',
    },
    {
      id: 'compare-runs',
      title: 'Compare LSTM vs Transformer',
      instruction:
        'Tick your chapter-4 LSTM run and this transformer run in History, then '
        + 'open the Compare tab.',
      detail:
        'Compare overlays their loss curves and diffs their configs — same dataset, '
        + 'different architecture: see which one learns faster.',
      target: trainingTabTarget('Compare'),
      isComplete: () => activeTrainingTab() === 'Compare',
    },
  ],
};

export default attention;
