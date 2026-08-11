/**
 * The course predicate toolbox (lib/Tutorial/predicates) and the chapters'
 * step predicates, driven with fake boards, the real trainingConfig singleton
 * (restored after every test), synthetic session signals through an injected
 * Emitter, and happy-dom for the DOM probes. Replaces the old mnistTutorial
 * suite (the MNIST tutorial was absorbed by course chapters 1–3).
 */
import { logicTest } from '../harness/define';
import {
  placedLayers, countLayersNamed, inputShapeEquals, layersConnected,
  selectedLayerIs, boardIsDirty,
  datasetSelected, epochsAtMost, phase2Configured,
  trainingPanelIsOpen, activeTrainingTab, elementPresent, generatedTextPresent,
  menuTarget, trainingTabTarget, trainButtonTarget,
} from '../../src/lib/Tutorial/predicates';
import type { TutorialBoardLike, TutorialLayerLike, TutorialStep } from '../../src/lib/Tutorial/predicates';
import { trainingConfig, resetTrainingConfig } from '../../src/lib/Training/trainingConfig';
import { Emitter } from '../../src/lib/Events/emitter';
import { installSessionSignals, resetSessionSignals } from '../../src/lib/Tutorial/sessionSignals';
import { getTutorial } from '../../src/lib/Tutorial/tutorials';

function makeLayer(
  name: string,
  parameterValues: Record<string, unknown> = {},
  id: unknown = undefined,
  inputLayers: unknown = undefined,
): TutorialLayerLike {
  return { id, inputLayers, kerasLayer: { name, parameterValues } };
}

function makeBoard(layers: TutorialLayerLike[]): TutorialBoardLike {
  return { getLayers: () => layers };
}

function stepsById(tutorialId: string): Record<string, TutorialStep> {
  const tutorial = getTutorial(tutorialId)!;
  return Object.fromEntries(tutorial.steps.map(step => [step.id, step]));
}

const cleanDom = () => { document.body.innerHTML = ''; };

// --- board predicates -------------------------------------------------------

logicTest('coursePredicates: placedLayers returns [] for an unready interface', ({ expect }) => {
  expect(placedLayers(undefined)).toEqual([]);
  expect(placedLayers({})).toEqual([]);
  expect(placedLayers({ getLayers: () => null })).toEqual([]);
  expect(countLayersNamed(undefined, 'Dense')).toBe(0);
});

logicTest('coursePredicates: inputShapeEquals requires the exact shape', ({ expect }) => {
  const board = (shape: unknown) => makeBoard([makeLayer('Input', { shape })]);
  expect(inputShapeEquals(board([28, 28, 1]), [28, 28, 1])).toBe(true);
  expect(inputShapeEquals(board(['28', '28', '1']), [28, 28, 1])).toBe(true); // string coercion
  expect(inputShapeEquals(board([28, 28]), [28, 28, 1])).toBe(false); // wrong length
  expect(inputShapeEquals(board([28, 28, 3]), [28, 28, 1])).toBe(false); // wrong value
  expect(inputShapeEquals(board([]), [28, 28, 1])).toBe(false);
  expect(inputShapeEquals(board('28,28,1'), [28, 28, 1])).toBe(false); // not an array
  expect(inputShapeEquals(board(undefined), [28, 28, 1])).toBe(false);
  expect(inputShapeEquals(makeBoard([makeLayer('Dense', { shape: [28, 28, 1] })]), [28, 28, 1])).toBe(false);
  expect(inputShapeEquals(null, [28, 28, 1])).toBe(false);
});

logicTest('coursePredicates: layersConnected reads the wiring off the wrappers', ({ expect }) => {
  const input = makeLayer('Input', {}, 0, []);
  const dense = makeLayer('Dense', {}, 1, [0]);
  const output = makeLayer('Output', {}, 2, [1]);
  const wired = makeBoard([input, dense, output]);
  expect(layersConnected(wired, 'Input', 'Dense')).toBe(true);
  expect(layersConnected(wired, 'Dense', 'Output')).toBe(true);
  expect(layersConnected(wired, 'Input', 'Output')).toBe(false); // not directly wired
  expect(layersConnected(wired, 'Conv2D', 'Dense')).toBe(false); // no such source

  const unwired = makeBoard([makeLayer('Input', {}, 0, []), makeLayer('Dense', {}, 1, [])]);
  expect(layersConnected(unwired, 'Input', 'Dense')).toBe(false);

  // Malformed wrappers never throw.
  const junk = makeBoard([{ kerasLayer: { name: 'Dense' } }, null as unknown as TutorialLayerLike]);
  expect(layersConnected(junk, 'Input', 'Dense')).toBe(false);
  expect(layersConnected(null, 'Input', 'Dense')).toBe(false);
});

logicTest('coursePredicates: selectedLayerIs matches the selection by layer type', ({ expect }) => {
  const conv = makeLayer('Conv2D');
  expect(selectedLayerIs({ getActiveElements: () => [conv] }, 'Conv2D')).toBe(true);
  expect(selectedLayerIs({ getActiveElements: () => [conv] }, 'Dense')).toBe(false);
  expect(selectedLayerIs({ getActiveElements: () => [] }, 'Conv2D')).toBe(false);
  expect(selectedLayerIs({ getActiveElements: () => null }, 'Conv2D')).toBe(false);
  expect(selectedLayerIs({ getActiveElements: () => [null, 42, {}] }, 'Conv2D')).toBe(false);
  expect(selectedLayerIs(null, 'Conv2D')).toBe(false);
});

logicTest('coursePredicates: boardIsDirty guards the facade getter', ({ expect }) => {
  expect(boardIsDirty({ isDirty: () => true })).toBe(true);
  expect(boardIsDirty({ isDirty: () => false })).toBe(false);
  expect(boardIsDirty({})).toBe(false);
  expect(boardIsDirty(null)).toBe(false);
  expect(boardIsDirty({ isDirty: () => { throw new Error('boom'); } })).toBe(false);
});

// --- trainingConfig predicates ----------------------------------------------

logicTest('coursePredicates: datasetSelected / epochsAtMost / phase2Configured read the live config', ({ expect }) => {
  resetTrainingConfig();
  try {
    expect(datasetSelected('MNIST')).toBe(true); // the default
    trainingConfig.selectedDataset = 'TinyShakespeare';
    expect(datasetSelected('MNIST')).toBe(false);
    expect(datasetSelected('TinyShakespeare')).toBe(true);

    trainingConfig.epochs = 50;
    expect(epochsAtMost(5)).toBe(false);
    trainingConfig.epochs = 3;
    expect(epochsAtMost(5)).toBe(true);
    trainingConfig.epochs = 0;
    expect(epochsAtMost(5)).toBe(false); // zero epochs trains nothing

    expect(phase2Configured('ShakespeareSonnets')).toBe(false); // disabled by default
    trainingConfig.phase2Enabled = true;
    trainingConfig.phase2Dataset = 'ShakespeareSonnets';
    expect(phase2Configured('ShakespeareSonnets')).toBe(true);
    expect(phase2Configured('TinyShakespeare')).toBe(false);
  } finally {
    resetTrainingConfig();
  }
});

// --- DOM probes -------------------------------------------------------------

logicTest('coursePredicates: trainingPanelIsOpen and elementPresent probe the DOM', ({ expect }) => {
  cleanDom();
  try {
    expect(trainingPanelIsOpen()).toBe(false);
    expect(elementPresent('#modelsWindow')).toBe(false);
    document.body.innerHTML = '<div id="trainingZone"></div><div id="modelsWindow"></div>';
    expect(trainingPanelIsOpen()).toBe(true);
    expect(elementPresent('#modelsWindow')).toBe(true);
    expect(elementPresent(':::not-a-selector')).toBe(false); // malformed: false, no throw
  } finally {
    cleanDom();
  }
});

logicTest('coursePredicates: activeTrainingTab reads the highlighted tab label', ({ expect }) => {
  cleanDom();
  try {
    expect(activeTrainingTab()).toBe(null);
    document.body.innerHTML = '<div id="TrainingZone">'
      + '<div class="bar-button">Dataset</div>'
      + '<div class="bar-button active"> Inspect </div>'
      + '</div>';
    expect(activeTrainingTab()).toBe('Inspect');
  } finally {
    cleanDom();
  }
});

logicTest('coursePredicates: generatedTextPresent requires text beyond the echoed seed', ({ expect }) => {
  cleanDom();
  try {
    expect(generatedTextPresent()).toBe(false);
    document.body.innerHTML = '<pre data-testid="inspect-generated-text">'
      + '<span class="inspect-generated-seed">The </span></pre>';
    expect(generatedTextPresent()).toBe(false); // only the seed so far
    document.body.innerHTML = '<pre data-testid="inspect-generated-text">'
      + '<span class="inspect-generated-seed">The </span>quick brown fox</pre>';
    expect(generatedTextPresent()).toBe(true);
  } finally {
    cleanDom();
  }
});

logicTest('coursePredicates: target factories resolve or fall back, never throw', ({ expect }) => {
  cleanDom();
  try {
    // Nothing rendered: menu target resolves to null without throwing.
    expect(menuTarget('Templates')(document)).toBe(null);
    expect(trainingTabTarget('Inspect')(document)).toBe(null);
    expect(trainButtonTarget(document)).toBe(null);

    // The menu bar exists but the dropdown is closed: fall back to the bar.
    document.body.innerHTML = '<div id="generalMenu"><ul id="GeneralMenu"></ul></div>';
    expect((menuTarget('Templates')(document) as Element).id).toBe('generalMenu');

    // Training tabs resolve by their text.
    document.body.innerHTML += '<div id="TrainingZone">'
      + '<div class="bar-button">Dataset</div><div class="bar-button">Inspect</div></div>';
    const tab = trainingTabTarget('Inspect')(document) as Element;
    expect(tab.textContent!.trim()).toBe('Inspect');
    // An unknown tab falls back to the training window (absent here → null ok).
    expect(trainingTabTarget('Nope')(document)).toBe(null);

    // The train button wins once it exists.
    document.body.innerHTML += '<button class="train-button">▶</button>';
    expect((trainButtonTarget(document) as Element).className).toBe('train-button');
  } finally {
    cleanDom();
  }
});

// --- chapter walkthroughs ---------------------------------------------------

const OWN = 'walkthrough-instance';
let uuidCounter = 0;

function makeSignalsWorld() {
  const events = new Emitter();
  const uninstall = installSessionSignals({ events, ownInstanceId: OWN });
  const emit = (type: string, streamId: string | null, payload: unknown) => {
    uuidCounter += 1;
    events.emit(type, {
      uuid: `walk-${uuidCounter}`,
      type,
      streamId,
      deviceId: 'device-walk',
      instanceId: OWN,
      seq: uuidCounter,
      dependsOn: [],
      wallTime: '2026-08-10T00:00:00.000Z',
      payload,
    });
  };
  return { emit, uninstall };
}

const runConfig = (dataset: string, extra: Record<string, unknown> = {}) => ({
  dataset, optimizer: 'adam', optimizerParams: {}, epochs: 3, loss: 'x', ...extra,
});

logicTest('course chapter 2 (first-training): completes step by step', ({ expect }) => {
  cleanDom();
  resetTrainingConfig();
  const { emit, uninstall } = makeSignalsWorld();
  try {
    const steps = stepsById('first-training');
    // The "2D Dense for MNIST" template shape, as wrappers.
    const board = makeBoard([
      makeLayer('Input', { shape: [28, 28, 1] }, 0, []),
      makeLayer('Flatten', {}, 1, [0]),
      makeLayer('Dense', {}, 2, [1]),
      makeLayer('Dense', {}, 3, [2]),
      makeLayer('Output', {}, 4, [3]),
    ]);
    expect(steps['get-mnist-net']!.isComplete(board)).toBe(true);
    expect(steps['get-mnist-net']!.isComplete(makeBoard([]))).toBe(false);

    expect(steps['open-training']!.isComplete(board)).toBe(false);
    document.body.innerHTML = '<div id="trainingZone"></div>';
    expect(steps['open-training']!.isComplete(board)).toBe(true);

    expect(steps['confirm-dataset']!.isComplete(board)).toBe(true); // MNIST is the default

    trainingConfig.epochs = 50;
    expect(steps['set-epochs']!.isComplete(board)).toBe(false);
    trainingConfig.epochs = 3;
    expect(steps['set-epochs']!.isComplete(board)).toBe(true);

    expect(steps['press-train']!.isComplete(board)).toBe(false);
    emit('run.started', 'run-1', {
      engineId: 'tfjs', config: runConfig('MNIST'), graphJson: '{"layers":[]}',
    });
    expect(steps['press-train']!.isComplete(board)).toBe(true);

    expect(steps['watch-loss']!.isComplete(board)).toBe(false);
    emit('run.epoch', 'run-1', { epoch: 0, loss: 1.2 });
    expect(steps['watch-loss']!.isComplete(board)).toBe(true);

    expect(steps['run-finishes']!.isComplete(board)).toBe(false);
    emit('run.finished', 'run-1', { outcome: 'cancelled' }); // stopping early is fine
    expect(steps['run-finishes']!.isComplete(board)).toBe(true);
  } finally {
    uninstall();
    resetSessionSignals();
    resetTrainingConfig();
    cleanDom();
  }
});

logicTest('course chapters 3+5: withLayer keeps the dense run from completing the CNN/transformer steps', ({ expect }) => {
  const { emit, uninstall } = makeSignalsWorld();
  try {
    const cnnSteps = stepsById('inspect-cnn');
    const attnSteps = stepsById('attention');
    // A dense MNIST run (chapter 2's) must NOT complete chapter 3's train step.
    emit('run.started', 'dense-run', {
      engineId: 'tfjs',
      config: runConfig('MNIST'),
      graphJson: JSON.stringify({ layers: [{ kerasLayer: { name: 'Dense' } }] }),
    });
    emit('run.epoch', 'dense-run', { epoch: 0 });
    emit('run.finished', 'dense-run', { outcome: 'completed' });
    expect(cnnSteps['train-cnn']!.isComplete(null)).toBe(false);

    emit('run.started', 'cnn-run', {
      engineId: 'tfjs',
      config: runConfig('MNIST'),
      graphJson: JSON.stringify({ layers: [{ kerasLayer: { name: 'Conv2D' } }] }),
    });
    expect(cnnSteps['train-cnn']!.isComplete(null)).toBe(true);
    expect(cnnSteps['cnn-run-finishes']!.isComplete(null)).toBe(false);
    emit('run.epoch', 'cnn-run', { epoch: 0 });
    emit('run.finished', 'cnn-run', { outcome: 'completed' });
    expect(cnnSteps['cnn-run-finishes']!.isComplete(null)).toBe(true);

    // The transformer chapter needs a TransformerBlock run on TinyShakespeare.
    expect(attnSteps['train-transformer']!.isComplete(null)).toBe(false);
    emit('run.started', 'attn-run', {
      engineId: 'tfjs',
      config: runConfig('TinyShakespeare'),
      graphJson: JSON.stringify({ layers: [{ kerasLayer: { name: 'TransformerBlock' } }] }),
    });
    emit('run.epoch', 'attn-run', { epoch: 0 });
    emit('run.finished', 'attn-run', { outcome: 'completed' });
    expect(attnSteps['train-transformer']!.isComplete(null)).toBe(true);
    expect(attnSteps['transformer-finishes']!.isComplete(null)).toBe(true);
  } finally {
    uninstall();
    resetSessionSignals();
  }
});

logicTest('course chapter 6 (browser-poet): checkpoint, fine-tune and lineage steps complete', ({ expect }) => {
  cleanDom();
  resetTrainingConfig();
  const { emit, uninstall } = makeSignalsWorld();
  try {
    const steps = stepsById('browser-poet');
    const gptBoard = makeBoard([
      makeLayer('TransformerBlock'), makeLayer('TransformerBlock'), makeLayer('Embedding'),
    ]);
    expect(steps['load-gpt-mini']!.isComplete(gptBoard)).toBe(true);
    expect(steps['load-gpt-mini']!.isComplete(makeBoard([makeLayer('TransformerBlock')]))).toBe(false);

    trainingConfig.selectedDataset = 'GutenbergPoetryXL';
    expect(steps['pick-gutenberg']!.isComplete(null)).toBe(true);

    emit('run.started', 'pre', {
      engineId: 'tfjs', config: runConfig('GutenbergPoetryXL'), graphJson: '{"layers":[]}',
    });
    emit('run.epoch', 'pre', { epoch: 0 });
    emit('run.finished', 'pre', { outcome: 'cancelled' });
    expect(steps['pretrain']!.isComplete(null)).toBe(true);

    expect(steps['make-it-yours']!.isComplete({ isDirty: () => false })).toBe(false);
    expect(steps['make-it-yours']!.isComplete({ isDirty: () => true })).toBe(true);

    expect(steps['save-checkpoint']!.isComplete(null)).toBe(false);
    emit('graph.checkpoint', null, { graphJson: '{}', parent: null });
    expect(steps['save-checkpoint']!.isComplete(null)).toBe(true);

    expect(steps['configure-finetune']!.isComplete(null)).toBe(false);
    trainingConfig.phase2Enabled = true;
    trainingConfig.phase2Dataset = 'ShakespeareSonnets';
    expect(steps['configure-finetune']!.isComplete(null)).toBe(true);

    expect(steps['finetune-run']!.isComplete(null)).toBe(false);
    emit('run.started', 'tuned', {
      engineId: 'tfjs',
      config: runConfig('GutenbergPoetryXL', { phase2Dataset: 'ShakespeareSonnets', phase2Epochs: 10 }),
      graphJson: '{"layers":[]}',
    });
    emit('run.epoch', 'tuned', { epoch: 0 });
    emit('run.finished', 'tuned', { outcome: 'completed' });
    expect(steps['finetune-run']!.isComplete(null)).toBe(true);

    expect(steps['see-lineage']!.isComplete(null)).toBe(false);
    document.body.innerHTML = '<div id="modelsWindow"></div>';
    expect(steps['see-lineage']!.isComplete(null)).toBe(true);

    expect(steps['poetry']!.isComplete(null)).toBe(false);
    document.body.innerHTML += '<pre data-testid="inspect-generated-text">'
      + '<span class="inspect-generated-seed">Shall I </span>compare thee</pre>';
    expect(steps['poetry']!.isComplete(null)).toBe(true);
  } finally {
    uninstall();
    resetSessionSignals();
    resetTrainingConfig();
    cleanDom();
  }
});
