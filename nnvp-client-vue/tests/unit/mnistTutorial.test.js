import { describe, it, expect } from 'bun:test';
import steps, {
  steps as namedSteps,
  totalSteps,
  getStep,
  placedLayers,
  countLayersNamed,
  inputShapeIsSet,
} from '../../src/lib/Tutorial/mnistTutorial';

// Build a fake $d3Interface exposing only what the tutorial predicates read:
// activeGraph.model.d3Layers, each layer with a kerasLayer { name, parameterValues }.
function makeLayer(name, parameterValues = {}) {
  return { kerasLayer: { name, parameterValues } };
}

function makeD3Interface(layers) {
  return {
    activeGraph: {
      model: { d3Layers: layers },
    },
  };
}

describe('mnistTutorial step definitions', () => {
  it('default export and named export are the same step list', () => {
    expect(steps).toBe(namedSteps);
  });

  it('exposes a well-formed, non-empty step list', () => {
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(totalSteps).toBe(steps.length);
    const ids = new Set();
    for (const step of steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
      expect(typeof step.instruction).toBe('string');
      expect(step.target === undefined
        || typeof step.target === 'string'
        || typeof step.target === 'function').toBe(true);
      expect(typeof step.isComplete).toBe('function');
      expect(ids.has(step.id)).toBe(false);
      ids.add(step.id);
    }
  });

  it('describes the minimal MNIST CNN path in order', () => {
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

  it('getStep looks up by id', () => {
    expect(getStep('add-conv2d')).toBe(steps[2]);
    expect(getStep('nope')).toBeUndefined();
  });
});

describe('helpers tolerate an unready interface', () => {
  it('placedLayers returns [] for missing graph/model', () => {
    expect(placedLayers(undefined)).toEqual([]);
    expect(placedLayers({})).toEqual([]);
    expect(placedLayers({ activeGraph: {} })).toEqual([]);
    expect(placedLayers({ activeGraph: { model: {} } })).toEqual([]);
  });

  it('predicates return false for an unready interface', () => {
    expect(countLayersNamed(undefined, 'Dense')).toBe(0);
    expect(inputShapeIsSet(undefined)).toBe(false);
    expect(getStep('add-input').isComplete(undefined)).toBe(false);
  });
});

describe('isComplete predicates against a fake model', () => {
  it('add-input completes once an Input layer exists', () => {
    const step = getStep('add-input');
    expect(step.isComplete(makeD3Interface([]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Dense')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Input')]))).toBe(true);
  });

  it('set-input-shape completes only once the Input shape is set', () => {
    const step = getStep('set-input-shape');
    expect(step.isComplete(makeD3Interface([makeLayer('Input')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Input', { shape: [] })]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Input', { shape: ['', ''] })]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Input', { shape: [28, 28, 1] })]))).toBe(true);
  });

  it('add-conv2d completes once a Conv2D exists', () => {
    const step = getStep('add-conv2d');
    expect(step.isComplete(makeD3Interface([makeLayer('Input', { shape: [28, 28, 1] })]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Conv2D')]))).toBe(true);
  });

  it('add-maxpooling2d completes once a MaxPooling2D exists', () => {
    const step = getStep('add-maxpooling2d');
    expect(step.isComplete(makeD3Interface([makeLayer('Conv2D')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('MaxPooling2D')]))).toBe(true);
  });

  it('add-flatten completes once a Flatten exists', () => {
    const step = getStep('add-flatten');
    expect(step.isComplete(makeD3Interface([makeLayer('MaxPooling2D')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Flatten')]))).toBe(true);
  });

  it('add-dense-hidden completes once one Dense exists', () => {
    const step = getStep('add-dense-hidden');
    expect(step.isComplete(makeD3Interface([makeLayer('Flatten')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Dense')]))).toBe(true);
  });

  it('add-dense-output requires a second Dense', () => {
    const step = getStep('add-dense-output');
    expect(step.isComplete(makeD3Interface([makeLayer('Dense')]))).toBe(false);
    expect(step.isComplete(makeD3Interface([makeLayer('Dense'), makeLayer('Dense')]))).toBe(true);
  });

  it('open-training does not complete without a Training panel in the DOM', () => {
    // Unit tests run in a node environment (no document), so the guard returns false.
    const step = getStep('open-training');
    const fullModel = makeD3Interface([
      makeLayer('Input', { shape: [28, 28, 1] }),
      makeLayer('Conv2D'),
      makeLayer('MaxPooling2D'),
      makeLayer('Flatten'),
      makeLayer('Dense'),
      makeLayer('Dense'),
    ]);
    expect(step.isComplete(fullModel)).toBe(false);
  });

  it('a full MNIST CNN model satisfies every layer-building step', () => {
    const fullModel = makeD3Interface([
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
});
