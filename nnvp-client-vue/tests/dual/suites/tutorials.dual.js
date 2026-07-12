/**
 * Tutorial registry + progress persistence (localStorage-backed). Migrated
 * from tests/unit/tutorials.test.js into the dual registry as logicTest. The
 * top-level beforeEach became setup() called at the top of each test.
 */
import { logicTest } from '../define';
import tutorials, {
  getTutorial, placedEdgeCount, selectedLayerCount,
  readProgress, markStepReached, markCompleted, completionRatio,
} from '../../../src/lib/Tutorial/tutorials';

// happy-dom (preloaded via bunfig; the playwright runner registers the same
// shim) provides a working localStorage.
const setup = () => localStorage.removeItem('nnvp-tutorial-progress');

// --- tutorial registry ------------------------------------------------------------

logicTest('tutorials: exposes three tutorials with unique ids and non-empty steps', ({ expect }) => {
  setup();
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

logicTest('tutorials: getTutorial finds by id', ({ expect }) => {
  setup();
  expect(getTutorial('mnist-cnn').steps.length).toBe(8);
  expect(getTutorial('nope')).toBeUndefined();
});

logicTest('tutorials: step predicates never throw on a not-ready editor', ({ expect }) => {
  setup();
  tutorials.forEach(tutorial => tutorial.steps.forEach((step) => {
    expect(() => step.isComplete(null)).not.toThrow();
    expect(() => step.isComplete({})).not.toThrow();
  }));
});

// --- editor-state helpers ------------------------------------------------------------

const fake$d3 = {
  activeGraph: { model: { d3Edges: [{}, {}] } },
  getActiveElements: () => [{ id: 0 }],
};

logicTest('tutorials: placedEdgeCount reads the model edges', ({ expect }) => {
  setup();
  expect(placedEdgeCount(fake$d3)).toBe(2);
  expect(placedEdgeCount(null)).toBe(0);
  expect(placedEdgeCount({ activeGraph: {} })).toBe(0);
});

logicTest('tutorials: selectedLayerCount reads the selection', ({ expect }) => {
  setup();
  expect(selectedLayerCount(fake$d3)).toBe(1);
  expect(selectedLayerCount(null)).toBe(0);
  expect(selectedLayerCount({ getActiveElements: () => null })).toBe(0);
});

logicTest('tutorials: connect-layers completes through its predicates', ({ expect }) => {
  setup();
  const steps = getTutorial('connect-layers').steps;
  const dense = { kerasLayer: { name: 'Dense' } };
  const $d3 = { activeGraph: { model: { d3Layers: [dense, dense], d3Edges: [{}] } } };
  steps.forEach(step => expect(step.isComplete($d3)).toBe(true));
});

// --- progress persistence --------------------------------------------------------------

logicTest('tutorials: progress starts empty and survives corrupted storage', ({ expect }) => {
  setup();
  expect(readProgress()).toEqual({});
  localStorage.setItem('nnvp-tutorial-progress', '{oops');
  expect(readProgress()).toEqual({});
});

logicTest('tutorials: markStepReached is monotonic', ({ expect }) => {
  setup();
  markStepReached('connect-layers', 2);
  markStepReached('connect-layers', 1);
  expect(readProgress()['connect-layers'].furthestStep).toBe(2);
});

logicTest('tutorials: completionRatio: 0 when unseen, fraction when partial, 1 when completed', ({ expect }) => {
  setup();
  const tutorial = getTutorial('connect-layers'); // 3 steps
  expect(completionRatio(tutorial)).toBe(0);
  markStepReached('connect-layers', 1);
  expect(completionRatio(tutorial)).toBeCloseTo(1 / 3);
  markCompleted('connect-layers');
  expect(completionRatio(tutorial)).toBe(1);
});

logicTest('tutorials: tracks tutorials independently', ({ expect }) => {
  setup();
  const tutorial = getTutorial('connect-layers'); // 3 steps
  markCompleted('mnist-cnn');
  expect(completionRatio(getTutorial('mnist-cnn'))).toBe(1);
  expect(completionRatio(tutorial)).toBe(0);
});
