import { describe, it, expect, beforeEach } from 'bun:test';
import tutorials, {
  getTutorial, placedEdgeCount, selectedLayerCount,
  readProgress, markStepReached, markCompleted, completionRatio,
} from '../../src/lib/Tutorial/tutorials';

// happy-dom (preloaded via bunfig) provides a working localStorage.
beforeEach(() => localStorage.removeItem('nnvp-tutorial-progress'));

describe('tutorial registry', () => {
  it('exposes three tutorials with unique ids and non-empty steps', () => {
    expect(tutorials.length).toBe(3);
    const ids = tutorials.map(t => t.id);
    expect(new Set(ids).size).toBe(3);
    tutorials.forEach((tutorial) => {
      expect(tutorial.title.length).toBeGreaterThan(0);
      expect(tutorial.description.length).toBeGreaterThan(0);
      expect(tutorial.steps.length).toBeGreaterThan(0);
      tutorial.steps.forEach((step) => {
        expect(typeof step.isComplete).toBe('function');
        expect(step.title.length).toBeGreaterThan(0);
      });
    });
  });

  it('getTutorial finds by id', () => {
    expect(getTutorial('mnist-cnn').steps.length).toBe(8);
    expect(getTutorial('nope')).toBeUndefined();
  });

  it('step predicates never throw on a not-ready editor', () => {
    tutorials.forEach(tutorial => tutorial.steps.forEach((step) => {
      expect(() => step.isComplete(null)).not.toThrow();
      expect(() => step.isComplete({})).not.toThrow();
    }));
  });
});

describe('editor-state helpers', () => {
  const fake$d3 = {
    activeGraph: { model: { d3Edges: [{}, {}] } },
    getActiveElements: () => [{ id: 0 }],
  };

  it('placedEdgeCount reads the model edges', () => {
    expect(placedEdgeCount(fake$d3)).toBe(2);
    expect(placedEdgeCount(null)).toBe(0);
    expect(placedEdgeCount({ activeGraph: {} })).toBe(0);
  });

  it('selectedLayerCount reads the selection', () => {
    expect(selectedLayerCount(fake$d3)).toBe(1);
    expect(selectedLayerCount(null)).toBe(0);
    expect(selectedLayerCount({ getActiveElements: () => null })).toBe(0);
  });

  it('connect-layers completes through its predicates', () => {
    const steps = getTutorial('connect-layers').steps;
    const dense = { kerasLayer: { name: 'Dense' } };
    const $d3 = { activeGraph: { model: { d3Layers: [dense, dense], d3Edges: [{}] } } };
    steps.forEach(step => expect(step.isComplete($d3)).toBe(true));
  });
});

describe('progress persistence', () => {
  const tutorial = getTutorial('connect-layers'); // 3 steps

  it('starts empty and survives corrupted storage', () => {
    expect(readProgress()).toEqual({});
    localStorage.setItem('nnvp-tutorial-progress', '{oops');
    expect(readProgress()).toEqual({});
  });

  it('markStepReached is monotonic', () => {
    markStepReached('connect-layers', 2);
    markStepReached('connect-layers', 1);
    expect(readProgress()['connect-layers'].furthestStep).toBe(2);
  });

  it('completionRatio: 0 when unseen, fraction when partial, 1 when completed', () => {
    expect(completionRatio(tutorial)).toBe(0);
    markStepReached('connect-layers', 1);
    expect(completionRatio(tutorial)).toBeCloseTo(1 / 3);
    markCompleted('connect-layers');
    expect(completionRatio(tutorial)).toBe(1);
  });

  it('tracks tutorials independently', () => {
    markCompleted('mnist-cnn');
    expect(completionRatio(getTutorial('mnist-cnn'))).toBe(1);
    expect(completionRatio(tutorial)).toBe(0);
  });
});
