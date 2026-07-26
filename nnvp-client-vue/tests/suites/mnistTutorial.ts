/**
 * MNIST tutorial step definitions and predicates (pure functions over a fake
 * $boardInterface). Migrated from tests/unit/mnistTutorial.test.js into the dual
 * registry as logicTest.
 */
import { logicTest } from '../harness/define';
import steps, {
  steps as namedSteps,
  totalSteps,
  getStep,
  placedLayers,
  countLayersNamed,
  inputShapeIsSet,
} from '../../src/lib/Tutorial/mnistTutorial';
import type { TutorialBoardLike, TutorialLayerLike } from '../../src/lib/Tutorial/mnistTutorial';

// Build a fake $boardInterface exposing only what the tutorial predicates read:
// getLayers(), each layer with a kerasLayer { name, parameterValues }.
function makeLayer(name: string, parameterValues: Record<string, unknown> = {}): TutorialLayerLike {
  return { kerasLayer: { name, parameterValues } };
}

function makeBoardInterface(layers: TutorialLayerLike[]): TutorialBoardLike {
  return {
    getLayers: () => layers,
  };
}

// --- step definitions ------------------------------------------------------------

logicTest('mnistTutorial: default export and named export are the same step list', ({ expect }) => {
  expect(steps).toBe(namedSteps);
});

logicTest('mnistTutorial: exposes a well-formed, non-empty step list', ({ expect }) => {
  expect(Array.isArray(steps)).toBe(true);
  expect(steps.length).toBeGreaterThan(0);
  expect(totalSteps).toBe(steps.length);
  const ids = new Set();
  for (const step of steps) {
    expect(typeof step.id).toBe('string');
    expect(typeof step.title).toBe('string');
    expect(typeof step.instruction).toBe('string');
    // TutorialStep types target as required, but the runtime contract this
    // test pins allows it to be absent — check through unknown.
    const target = step.target as unknown;
    expect(target === undefined
      || typeof target === 'string'
      || typeof target === 'function').toBe(true);
    expect(typeof step.isComplete).toBe('function');
    expect(ids.has(step.id)).toBe(false);
    ids.add(step.id);
  }
});

logicTest('mnistTutorial: describes the minimal MNIST CNN path in order', ({ expect }) => {
  expect(steps.map(s => s.id)).toEqual([
    'add-input',
    'set-input-shape',
    'add-conv2d',
    'add-maxpooling2d',
    'add-flatten',
    'add-dense-hidden',
    'add-dense-output',
    'open-training',
  ]);
});

logicTest('mnistTutorial: getStep looks up by id', ({ expect }) => {
  expect(getStep('add-conv2d')).toBe(steps[2]);
  expect(getStep('nope')).toBeUndefined();
});

// --- helpers tolerate an unready interface ------------------------------------------

logicTest('mnistTutorial: placedLayers returns [] for an unready interface', ({ expect }) => {
  expect(placedLayers(undefined)).toEqual([]);
  expect(placedLayers({})).toEqual([]);
  expect(placedLayers({ getLayers: () => null })).toEqual([]);
  expect(placedLayers({ getLayers: () => undefined })).toEqual([]);
});

logicTest('mnistTutorial: predicates return false for an unready interface', ({ expect }) => {
  expect(countLayersNamed(undefined, 'Dense')).toBe(0);
  expect(inputShapeIsSet(undefined)).toBe(false);
  expect(getStep('add-input')!.isComplete(undefined)).toBe(false);
});

// --- isComplete predicates against a fake model ---------------------------------------

logicTest('mnistTutorial: add-input completes once an Input layer exists', ({ expect }) => {
  const step = getStep('add-input')!;
  expect(step.isComplete(makeBoardInterface([]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Dense')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Input')]))).toBe(true);
});

logicTest('mnistTutorial: set-input-shape completes only once the Input shape is set', ({ expect }) => {
  const step = getStep('set-input-shape')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('Input')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Input', { shape: [] })]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Input', { shape: ['', ''] })]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Input', { shape: [28, 28, 1] })]))).toBe(true);
});

logicTest('mnistTutorial: add-conv2d completes once a Conv2D exists', ({ expect }) => {
  const step = getStep('add-conv2d')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('Input', { shape: [28, 28, 1] })]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Conv2D')]))).toBe(true);
});

logicTest('mnistTutorial: add-maxpooling2d completes once a MaxPooling2D exists', ({ expect }) => {
  const step = getStep('add-maxpooling2d')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('Conv2D')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('MaxPooling2D')]))).toBe(true);
});

logicTest('mnistTutorial: add-flatten completes once a Flatten exists', ({ expect }) => {
  const step = getStep('add-flatten')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('MaxPooling2D')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Flatten')]))).toBe(true);
});

logicTest('mnistTutorial: add-dense-hidden completes once one Dense exists', ({ expect }) => {
  const step = getStep('add-dense-hidden')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('Flatten')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Dense')]))).toBe(true);
});

logicTest('mnistTutorial: add-dense-output requires a second Dense', ({ expect }) => {
  const step = getStep('add-dense-output')!;
  expect(step.isComplete(makeBoardInterface([makeLayer('Dense')]))).toBe(false);
  expect(step.isComplete(makeBoardInterface([makeLayer('Dense'), makeLayer('Dense')]))).toBe(true);
});

logicTest('mnistTutorial: open-training does not complete without a Training panel in the DOM', ({ expect }) => {
  // Unit tests run in a node environment (no document), so the guard returns false.
  const step = getStep('open-training')!;
  const fullModel = makeBoardInterface([
    makeLayer('Input', { shape: [28, 28, 1] }),
    makeLayer('Conv2D'),
    makeLayer('MaxPooling2D'),
    makeLayer('Flatten'),
    makeLayer('Dense'),
    makeLayer('Dense'),
  ]);
  expect(step.isComplete(fullModel)).toBe(false);
});

logicTest('mnistTutorial: a full MNIST CNN model satisfies every layer-building step', ({ expect }) => {
  const fullModel = makeBoardInterface([
    makeLayer('Input', { shape: [28, 28, 1] }),
    makeLayer('Conv2D'),
    makeLayer('MaxPooling2D'),
    makeLayer('Flatten'),
    makeLayer('Dense'),
    makeLayer('Dense'),
  ]);
  const buildingSteps = steps.filter(s => s.id !== 'open-training');
  for (const step of buildingSteps) {
    expect(step.isComplete(fullModel)).toBe(true);
  }
});
