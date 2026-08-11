/**
 * Tutorial registry + progress persistence (localStorage-backed). The
 * registry now holds the seven course chapters ("From your first layer to a
 * browser poet"); predicate helpers live in lib/Tutorial/predicates and the
 * per-chapter walkthroughs in coursePredicates.ts.
 */
import { logicTest } from '../harness/define';
import tutorials, {
  getTutorial,
  readProgress, markStepReached, markCompleted, completionRatio, resetProgress,
} from '../../src/lib/Tutorial/tutorials';
import { placedEdgeCount, selectedLayerCount } from '../../src/lib/Tutorial/predicates';
import type { TutorialBoardLike } from '../../src/lib/Tutorial/predicates';

// happy-dom (preloaded via bunfig; the playwright runner registers the same
// shim) provides a working localStorage.
const setup = () => localStorage.removeItem('nnvp-tutorial-progress');

// --- tutorial registry ------------------------------------------------------------

logicTest('tutorials: exposes the seven course chapters with unique ids and non-empty steps', ({ expect }) => {
  setup();
  expect(tutorials.length).toBe(7);
  const ids = tutorials.map(t => t.id);
  expect(new Set(ids).size).toBe(7);
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

logicTest('tutorials: every chapter carries the course id and orders run 1..7', ({ expect }) => {
  setup();
  tutorials.forEach((tutorial) => {
    expect(tutorial.course!.id).toBe('browser-poet');
  });
  expect(tutorials.map(t => t.course!.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

logicTest('tutorials: getTutorial finds by id', ({ expect }) => {
  setup();
  expect(getTutorial('welcome')!.steps.length).toBe(4);
  expect(getTutorial('hello-layer')!.steps.length).toBe(6);
  expect(getTutorial('browser-poet')!.steps.length).toBe(9);
  expect(getTutorial('nope')).toBeUndefined();
});

logicTest('tutorials: step predicates never throw on a not-ready editor', ({ expect }) => {
  setup();
  tutorials.forEach(tutorial => tutorial.steps.forEach((step) => {
    expect(() => step.isComplete(null)).not.toThrow();
    expect(() => step.isComplete({})).not.toThrow();
  }));
});

logicTest('tutorials: step targets are selectors or resolver functions that never throw', ({ expect }) => {
  setup();
  tutorials.forEach(tutorial => tutorial.steps.forEach((step) => {
    if (typeof step.target === 'function') {
      expect(() => (step.target as (doc: Document) => Element | null)(document)).not.toThrow();
    } else {
      expect(step.target.length).toBeGreaterThan(0);
    }
  }));
});

// --- editor-state helpers ------------------------------------------------------------

const fake$d3: TutorialBoardLike = {
  getEdges: () => [{}, {}],
  getActiveElements: () => [{ id: 0 }],
};

logicTest('tutorials: placedEdgeCount reads the model edges', ({ expect }) => {
  setup();
  expect(placedEdgeCount(fake$d3)).toBe(2);
  expect(placedEdgeCount(null)).toBe(0);
  expect(placedEdgeCount({})).toBe(0);
  expect(placedEdgeCount({ getEdges: () => null })).toBe(0);
});

logicTest('tutorials: selectedLayerCount reads the selection', ({ expect }) => {
  setup();
  expect(selectedLayerCount(fake$d3)).toBe(1);
  expect(selectedLayerCount(null)).toBe(0);
  expect(selectedLayerCount({ getActiveElements: () => null })).toBe(0);
});

logicTest('tutorials: hello-layer completes through its predicates on a wired board', ({ expect }) => {
  setup();
  const steps = getTutorial('hello-layer')!.steps;
  const input = {
    id: 0, inputLayers: [], kerasLayer: { name: 'Input', parameterValues: { shape: [28, 28, 1] } },
  };
  const dense = { id: 1, inputLayers: [0], kerasLayer: { name: 'Dense', parameterValues: {} } };
  const output = { id: 2, inputLayers: [1], kerasLayer: { name: 'Output', parameterValues: {} } };
  const $d3: TutorialBoardLike = { getLayers: () => [input, dense, output] };
  steps.forEach(step => expect(step.isComplete($d3)).toBe(true));
});

logicTest('tutorials: hello-layer wiring steps stay incomplete on an unwired board', ({ expect }) => {
  setup();
  const steps = getTutorial('hello-layer')!.steps;
  const input = {
    id: 0, inputLayers: [], kerasLayer: { name: 'Input', parameterValues: { shape: [28, 28, 1] } },
  };
  const dense = { id: 1, inputLayers: [], kerasLayer: { name: 'Dense', parameterValues: {} } };
  const output = { id: 2, inputLayers: [], kerasLayer: { name: 'Output', parameterValues: {} } };
  const $d3: TutorialBoardLike = { getLayers: () => [input, dense, output] };
  const byId = Object.fromEntries(steps.map(step => [step.id, step]));
  expect(byId['connect-input-dense']!.isComplete($d3)).toBe(false);
  expect(byId['connect-dense-output']!.isComplete($d3)).toBe(false);
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
  markStepReached('hello-layer', 2);
  markStepReached('hello-layer', 1);
  expect(readProgress()['hello-layer']!.furthestStep).toBe(2);
});

logicTest('tutorials: completionRatio: 0 when unseen, fraction when partial, 1 when completed', ({ expect }) => {
  setup();
  const tutorial = getTutorial('hello-layer')!; // 6 steps
  expect(completionRatio(tutorial)).toBe(0);
  markStepReached('hello-layer', 3);
  expect(completionRatio(tutorial)).toBeCloseTo(3 / 6);
  markCompleted('hello-layer');
  expect(completionRatio(tutorial)).toBe(1);
});

logicTest('tutorials: resetProgress drops every stored trail', ({ expect }) => {
  setup();
  markStepReached('hello-layer', 3);
  markCompleted('first-training');
  expect(Object.keys(readProgress()).length).toBe(2);
  resetProgress();
  expect(readProgress()).toEqual({});
  expect(completionRatio(getTutorial('first-training')!)).toBe(0);
});

logicTest('tutorials: tracks tutorials independently', ({ expect }) => {
  setup();
  const tutorial = getTutorial('hello-layer')!;
  markCompleted('first-training');
  expect(completionRatio(getTutorial('first-training')!)).toBe(1);
  expect(completionRatio(tutorial)).toBe(0);
});
